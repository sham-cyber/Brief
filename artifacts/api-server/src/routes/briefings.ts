import { Router, type IRouter } from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  CreateBriefingBody,
  CreateBriefingResponse,
  GetBriefingSourceStatusResponse,
} from "@workspace/api-zod";
import { clerkClient, getAuth } from "@clerk/express";
import {
  cancelTavilyQuotaReservation,
  finishTavilyQuotaReservation,
  getTavilyDailyUsageStatus,
  getTavilyQuotaStatus,
  reserveTavilyQuota,
  TAVILY_CRAWL_HARD_STOP_MS,
  TAVILY_DAILY_CRAWL_START_LIMIT,
  TAVILY_DAILY_LIMIT_MS,
  TAVILY_DAILY_SEARCH_REQUEST_LIMIT,
  TAVILY_MAX_SEARCHES_PER_BRIEFING,
  TAVILY_QUOTA_TIME_ZONE,
} from "../lib/tavily-quota";
import {
  reserveTavilyRequestSlots,
  TAVILY_REQUEST_LIMIT,
} from "../lib/tavily-rate-limit";
import { searchTavily, TavilySearchError } from "../lib/tavily";
import {
  getTavilyCredentialStatus,
  getUserTavilyApiKey,
} from "../lib/user-tavily-credentials";

const router: IRouter = Router();
const START_PIN_MAX_ATTEMPTS = 5;
const START_PIN_ATTEMPT_WINDOW_MS = 15 * 60_000;
const START_PIN_LOCKOUT_MS = 15 * 60_000;
const startPinFailures = new Map<
  string,
  { attempts: number; windowStartedAt: number; lockedUntil: number }
>();
let ownerIdentityCache:
  | { email: string; userId: string; expiresAt: number }
  | null = null;

async function resolveOwnerUserId(email: string): Promise<string | null> {
  if (
    ownerIdentityCache?.email === email &&
    ownerIdentityCache.expiresAt > Date.now()
  ) {
    return ownerIdentityCache.userId;
  }
  const result = await clerkClient.users.getUserList({
    emailAddress: [email],
    limit: 1,
  });
  const owner = result.data.find((user) =>
    user.emailAddresses.some(
      (address) => address.emailAddress.trim().toLowerCase() === email,
    ),
  );
  if (!owner) return null;
  ownerIdentityCache = {
    email,
    userId: owner.id,
    expiresAt: Date.now() + 5 * 60_000,
  };
  return owner.id;
}

function startPinLockSeconds(userId: string): number {
  const now = Date.now();
  const state = startPinFailures.get(userId);
  if (!state) return 0;
  if (state.lockedUntil > now) return Math.ceil((state.lockedUntil - now) / 1000);
  if (
    now - state.windowStartedAt >= START_PIN_ATTEMPT_WINDOW_MS ||
    state.lockedUntil > 0
  ) {
    startPinFailures.delete(userId);
  }
  return 0;
}

function recordStartPinFailure(userId: string): number {
  const now = Date.now();
  const previous = startPinFailures.get(userId);
  const state =
    previous && now - previous.windowStartedAt < START_PIN_ATTEMPT_WINDOW_MS
      ? previous
      : { attempts: 0, windowStartedAt: now, lockedUntil: 0 };
  state.attempts += 1;
  if (state.attempts >= START_PIN_MAX_ATTEMPTS) {
    state.lockedUntil = now + START_PIN_LOCKOUT_MS;
  }
  startPinFailures.set(userId, state);
  return state.lockedUntil > now
    ? Math.ceil((state.lockedUntil - now) / 1000)
    : 0;
}

type NewsItem = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  snippet: string;
  images: { url: string; description: string }[];
  affiliatedCompanyReport: boolean;
};

type BriefingTopic = "news" | "hire" | "launch" | "financial" | "risk";
type PersonRole = "business_owner" | "mp" | "corporate";
type SourceMatch = "subject" | "company";
type RawNewsItem = Omit<NewsItem, "id" | "affiliatedCompanyReport">;
type SearchResult = { source: NewsItem; searchedAs: BriefingTopic };
type SearchNewsResult = {
  sources: SearchResult[];
  resultsReturned: number;
  creditsUsed: number | null;
  searchesCompleted: number;
};

class BriefingSearchFailure extends Error {
  constructor(
    readonly statuses: number[],
    readonly creditsUsed: number | null,
    readonly searchesCompleted: number,
  ) {
    super("One or more Tavily topic searches failed.");
    this.name = "BriefingSearchFailure";
  }
}

const ROLE_SEARCH_TERMS: Record<PersonRole, string> = {
  business_owner: "(business owner OR founder OR chairman OR entrepreneur OR CEO)",
  mp: "(Member of Parliament OR MP OR legislator OR constituency OR parliament)",
  corporate: "(corporate executive OR CEO OR director OR executive leadership)",
};

const CONTEXT_STOP_WORDS = new Set([
  "about", "after", "also", "and", "before", "between", "during", "for",
  "from", "have", "into", "meeting", "need", "new", "our", "that", "the",
  "their", "them", "there", "these", "this", "those", "through", "today",
  "want", "what", "when", "where", "which", "with", "would",
]);

function normalizeToken(token: string): string {
  const lower = token.toLocaleLowerCase();
  if (lower.length > 4 && lower.endsWith("ies")) return `${lower.slice(0, -3)}y`;
  if (lower.length > 4 && lower.endsWith("s") && !lower.endsWith("ss")) {
    return lower.slice(0, -1);
  }
  return lower;
}

function getContextTerms(context?: string): string[] {
  if (!context) return [];
  const terms = context.match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(
    terms
      .map(normalizeToken)
      .filter((term) => term.length >= 3 && !CONTEXT_STOP_WORDS.has(term)),
  )].slice(0, 8);
}

function contextRelevanceScore(source: NewsItem, terms: string[]): number {
  if (terms.length === 0) return 0;

  const tokenize = (value: string) =>
    new Set((value.match(/[\p{L}\p{N}]+/gu) ?? []).map(normalizeToken));
  const titleTerms = tokenize(source.title);
  const bodyTerms = tokenize(`${source.snippet} ${source.publisher}`);
  let score = 0;
  let matchedTerms = 0;

  for (const term of terms) {
    if (titleTerms.has(term)) {
      score += 5;
      matchedTerms += 1;
    } else if (bodyTerms.has(term)) {
      score += 2;
      matchedTerms += 1;
    }
  }

  if (matchedTerms > 1) score += (matchedTerms - 1) * 2;
  if (matchedTerms === terms.length && terms.length > 1) score += 4;
  return score;
}

function sourceMatchScope(
  source: NewsItem,
  subject: string,
  subjectType: "company" | "person",
  associatedCompany: string | null,
): SourceMatch | null {
  const normalize = (value: string) =>
    (value.match(/[\p{L}\p{N}]+/gu) ?? []).join(" ").toLocaleLowerCase();
  const companyQualifiers = new Set([
    "automotive", "automobiles", "bank", "cables", "cement", "chemicals",
    "electronics", "energy", "finance", "foods", "industries", "infrastructure",
    "logistics", "motors", "pharma", "pharmaceuticals", "power", "software",
    "steel", "systems", "technology", "technologies", "telecom",
  ]);
  const title = normalize(source.title);
  const content = normalize(`${source.title} ${source.snippet}`);
  const includesPhrase = (value: string) => {
    const target = normalize(value);
    return Boolean(target && ` ${content} `.includes(` ${target} `));
  };
  const belongsToDifferentCompany = (requestedCompany: string) => {
    const targetWords = normalize(requestedCompany).split(" ");
    const titleWords = title.split(" ");
    const targetQualifier = targetWords.find((word) => companyQualifiers.has(word));
    const titleQualifier = titleWords.find((word) => companyQualifiers.has(word));
    const sharesLeadingName = targetWords[0] && titleWords[0] === targetWords[0];
    return Boolean(
      sharesLeadingName &&
      targetQualifier &&
      titleQualifier &&
      targetQualifier !== titleQualifier,
    );
  };

  if (includesPhrase(subject)) {
    if (
      subjectType === "company" &&
      belongsToDifferentCompany(subject)
    ) {
      return null;
    }
    return subjectType === "company" ? "company" : "subject";
  }

  if (
    subjectType === "person" &&
    associatedCompany &&
    includesPhrase(associatedCompany) &&
    !belongsToDifferentCompany(associatedCompany)
  ) {
    return "company";
  }
  return null;
}

function quoteSearchPhrase(value: string | null): string {
  if (!value) return "";
  const phrase = value
    .replace(/["\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return phrase ? ` "${phrase}"` : "";
}

function sourceImages(value: unknown, title: string): { url: string; description: string }[] {
  if (!Array.isArray(value)) return [];
  const images: { url: string; description: string }[] = [];
  const seen = new Set<string>();

  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const image = candidate as { url?: unknown; description?: unknown };
    if (typeof image.url !== "string") continue;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(image.url);
    } catch {
      continue;
    }
    if (parsedUrl.protocol !== "https:" || seen.has(parsedUrl.href)) continue;

    seen.add(parsedUrl.href);
    const description =
      typeof image.description === "string" && image.description.trim()
        ? image.description.trim().slice(0, 240)
        : `Photo related to ${title}`.slice(0, 240);
    images.push({ url: parsedUrl.href, description });
    if (images.length === 1) break;
  }
  return images;
}

async function searchNews(
  subject: string,
  subjectType: "company" | "person",
  personRole: PersonRole | null,
  topics: BriefingTopic[],
  apiKey: string,
  start: Date,
  end: Date,
  context?: string,
  publicRoleTitle: string | null = null,
  companyName: string | null = null,
  signal?: AbortSignal,
): Promise<SearchNewsResult> {
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const roleTerms = subjectType === "person" && personRole
    ? ` ${ROLE_SEARCH_TERMS[personRole]}`
    : "";
  const publicOfficeTerm =
    subjectType === "person" && personRole === "mp"
      ? quoteSearchPhrase(publicRoleTitle)
      : "";
  const companyTerm =
    subjectType === "person" && personRole === "business_owner"
      ? quoteSearchPhrase(companyName)
      : "";
  const personTerms = `${roleTerms}${publicOfficeTerm}${companyTerm}`;
  const isChairmanCompanyBrief =
    subjectType === "person" &&
    personRole === "business_owner" &&
    Boolean(companyName);
  const searchTerms: { topic: BriefingTopic; query: string }[] = topics.map((topic) => {
    const terms: Record<BriefingTopic, string> = {
      news: "recent news coverage",
      hire: "careers recruitment hiring vacancies job openings sales maintenance roles appointed joined new executive",
      launch: "product launch released introduced unveiled",
      financial: subjectType === "company" || isChairmanCompanyBrief
        ? "share price earnings profit loss revenue financial results"
        : "financial results investment profit loss funding",
      risk: "risk lawsuit investigation recall regulator fine breach restructuring",
    };
    const query = isChairmanCompanyBrief
      ? `${quoteSearchPhrase(companyName).trim()} ${terms[topic]}`
      : `${subject}${personTerms} ${terms[topic]}`;
    return { topic, query };
  });
  const settled = await Promise.allSettled(
    searchTerms.map(async ({ topic, query }) => ({
      topic,
      ...(await searchTavily(query, startDate, endDate, apiKey, signal)),
    })),
  );
  const fulfilled = settled.flatMap((entry) =>
    entry.status === "fulfilled" ? [entry.value] : [],
  );
  const failedStatuses = settled.flatMap((entry) => {
    if (entry.status === "fulfilled") return [];
    return entry.reason instanceof TavilySearchError ? [entry.reason.status] : [0];
  });
  const creditReports = fulfilled.map(({ creditsUsed }) => creditsUsed);
  const creditsUsed = creditReports.every((value) => value !== null)
    ? creditReports.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;

  if (failedStatuses.length > 0) {
    throw new BriefingSearchFailure(failedStatuses, creditsUsed, fulfilled.length);
  }

  const uniqueItems = new Map<string, { item: RawNewsItem; searchedAs: BriefingTopic }>();
  for (const { topic, results } of fulfilled) {
    for (const result of results) {
      const title = typeof result.title === "string" ? result.title.trim() : "";
      const link = typeof result.url === "string" ? result.url : "";
      const snippet = typeof result.content === "string" ? result.content.trim() : "";
      const published = typeof result.published_date === "string"
        ? new Date(result.published_date)
        : null;
      const validDate =
        published && !Number.isNaN(published.getTime()) ? published : null;
      if (!title || !link || !validDate) continue;

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(link);
        if (parsedUrl.protocol !== "https:") continue;
      } catch {
        continue;
      }
      const publishedDay = validDate.toISOString().slice(0, 10);
      if (publishedDay < startDate || publishedDay > endDate) continue;

      const canonicalUrl = new URL(parsedUrl);
      canonicalUrl.hash = "";
      const canonicalLink = canonicalUrl.toString();
      if (uniqueItems.has(canonicalLink)) continue;
      const publisher = parsedUrl.hostname.replace(/^www\./, "");

      uniqueItems.set(canonicalLink, {
        item: {
          title,
          url: link,
          publisher,
          publishedAt: validDate.toISOString(),
          snippet: snippet.slice(0, 700),
          images: sourceImages(result.images, title),
        },
        searchedAs: topic,
      });
    }
  }

  const contextKeywords = getContextTerms(context);
  const sources = [...uniqueItems.values()]
    .flatMap((entry) => {
      const matchScope = sourceMatchScope(
        { ...entry.item, id: "", affiliatedCompanyReport: false },
        subject,
        subjectType,
        isChairmanCompanyBrief ? companyName : null,
      );
      if (
        !matchScope ||
        classifySource({ ...entry.item, id: "", affiliatedCompanyReport: false }, entry.searchedAs, topics) === null
      ) {
        return [];
      }
      return [{
        ...entry,
        affiliatedCompanyReport:
          subjectType === "person" && matchScope === "company",
        contextScore: contextRelevanceScore(
          { ...entry.item, id: "", affiliatedCompanyReport: false },
          contextKeywords,
        ),
      }];
    })
    .sort((a, b) =>
      b.contextScore - a.contextScore ||
      new Date(b.item.publishedAt ?? 0).getTime() -
        new Date(a.item.publishedAt ?? 0).getTime(),
    )
    .slice(0, 18)
    .map(({ item, searchedAs, affiliatedCompanyReport }, index) => ({
      source: { ...item, affiliatedCompanyReport, id: `S${index + 1}` },
      searchedAs,
    }));
  return {
    sources,
    resultsReturned: fulfilled.reduce((total, search) => total + search.results.length, 0),
    creditsUsed,
    searchesCompleted: fulfilled.length,
  };
}

const TOPIC_MATCHERS: Record<Exclude<BriefingTopic, "news">, RegExp> = {
  hire: /\b(?:appointed|appoints|appointment|joins?|joined|hired|hire|hiring|open\s+roles?|job\s+(?:openings?|listings?)|vacancies|careers?|recruit(?:ing|ment)|seeking\s+candidates|positions?\s+available|current\s+openings?|named\s+(?:as|to)|promoted|promotion|new\s+(?:CEO|CFO|CTO|chief executive|president|chair|director))\b/i,
  launch: /\b(?:launch(?:es|ed)?|releas(?:e|es|ed)|introduc(?:e|es|ed|ing)|unveil(?:s|ed)?|debut(?:s|ed)?|roll(?:s)? out|now available)\b/i,
  financial: /\b(?:profit|loss|earnings|revenue|stock|shares?|share price|financial results|quarterly results|valuation|funding|investment|IPO|cost savings)\b/i,
  risk: /\b(?:risk|lawsuit|sues|sued|recall|investigation|probe|regulator|fine|penalty|violation|restructuring|breach|complaint|layoff|supply issue|supply shortage|supply disruption|temporary closure|closure|shutdown|production disruption)\b/i,
};

function classifySource(
  source: NewsItem,
  fallback: BriefingTopic,
  selectedTopics: BriefingTopic[],
): BriefingTopic | null {
  const text = `${source.title} ${source.snippet}`;
  for (const topic of ["risk", "financial", "hire", "launch"] as const) {
    if (selectedTopics.includes(topic) && TOPIC_MATCHERS[topic].test(text)) {
      return topic;
    }
  }
  if (fallback === "news") return selectedTopics.includes("news") ? "news" : null;
  return TOPIC_MATCHERS[fallback].test(text) ? fallback : null;
}

type BriefingSignal = { text: string; sourceIds: string[] };

const POSITIVE_SIGNAL_PATTERNS = [
  /\b(?:surges?|surged|soars?|soared|rises?|rose|gains?|gained|increases?|increased|grew|growth|higher|rebound(?:s|ed)?)\b/i,
  /\b(?:record|beat(?:s)? estimates?|stronger|improves?|improvement|profitability|opportunit(?:y|ies))\b/i,
  /\b(?:launch(?:es|ed)?|introduc(?:e|es|ed|ing)|unveil(?:s|ed)?|award(?:ed)?|wins?|won|approved|approval|expansion|expands?|appointed|appointment)\b/i,
];

const NEGATIVE_SIGNAL_PATTERNS = [
  /\b(?:declines?|declined|falls?|fell|drops?|dropped|down|loss(?:es)?|weak(?:ness)?|lower|shortfall)\b/i,
  /\b(?:risk(?:s)?|lawsuit|sues?|sued|investigation|probe|recall|fine|penalt(?:y|ies)|violation|breach|fraud)\b/i,
  /\b(?:layoffs?|cuts?|miss(?:es|ed)? estimates?|debt|delay(?:s|ed)?|slowdown|warning|concern|pressure|supply issue|supply shortage|disruption|closure|shutdown|restructur(?:e|ing))\b/i,
];

router.get("/briefings", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId ?? null;
  const ownerEmail = process.env.BRIEFING_OWNER_EMAIL?.trim().toLowerCase();
  let canStart = false;
  if (userId && ownerEmail) {
    try {
      canStart = (await resolveOwnerUserId(ownerEmail)) === userId;
    } catch (error) {
      req.log.error({ error }, "Failed to verify the briefing owner account for status");
    }
  }
  const credentialStatus = await getTavilyCredentialStatus(userId);
  const projectKeyConfigured = canStart && Boolean(process.env.TAVILY_API_KEY?.trim());
  const keySource = projectKeyConfigured
    ? "project-owner"
    : credentialStatus.connected
      ? "account"
      : "missing";
  const quota = await getTavilyQuotaStatus();
  const dailyUsage = canStart && userId
    ? await getTavilyDailyUsageStatus(userId)
    : null;
  res.json(GetBriefingSourceStatusResponse.parse({
    provider: "tavily",
    configured: keySource !== "missing",
    canStart,
    keySource,
    startPinConfigured: /^\d{4}$/.test(process.env.BRIEFING_START_PIN?.trim() ?? ""),
    ownerAccountConfigured: Boolean(process.env.BRIEFING_OWNER_EMAIL?.trim()),
    dailyCrawlLimitMs: TAVILY_DAILY_LIMIT_MS,
    dailyCrawlUsedMs: quota.usedMs,
    dailyCrawlRemainingMs: quota.remainingMs,
    dailyCrawlActive: quota.active,
    dailyCrawlResetsAt: quota.resetsAt?.toISOString() ?? null,
    dailyCrawlStartsLimit: dailyUsage?.dailyCrawlStartsLimit ?? null,
    dailyCrawlStartsUsed: dailyUsage?.dailyCrawlStartsUsed ?? null,
    dailyCrawlStartsRemaining: dailyUsage?.dailyCrawlStartsRemaining ?? null,
    dailySearchRequestsLimit: dailyUsage?.dailySearchRequestsLimit ?? null,
    dailySearchRequestsUsed: dailyUsage?.dailySearchRequestsUsed ?? null,
    dailySearchRequestsRemaining: dailyUsage?.dailySearchRequestsRemaining ?? null,
    maxSearchesPerBriefing: TAVILY_MAX_SEARCHES_PER_BRIEFING,
    searchDepth: "basic",
  }));
});

function countSignalMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + Number(pattern.test(text)), 0);
}

function cleanSourceTitle(source: NewsItem): string {
  const publisher = source.publisher.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.title.replace(
    new RegExp(`\\s*(?:-|–|—|\\|)\\s*${publisher}\\s*$`, "i"),
    "",
  );
}

function buildTopSignal(
  sources: SearchResult[],
  contextTerms: string[],
  polarity: "positive" | "negative",
  scopeLabel = "the selected public reports",
): BriefingSignal {
  const patterns = polarity === "positive"
    ? POSITIVE_SIGNAL_PATTERNS
    : NEGATIVE_SIGNAL_PATTERNS;
  const signalPhrases = (source: NewsItem) => [
    ...cleanSourceTitle(source).split(/\b(?:despite|but|while|although|however)\b/i),
    ...source.snippet.split(/(?<=[.!?])\s+/),
  ]
    .map((phrase) => phrase.trim().replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, ""))
    .filter(Boolean)
    .map((phrase) => ({
      phrase,
      score: countSignalMatches(phrase, patterns),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);
  const candidates = sources
    .map((entry, index) => ({
      entry,
      index,
      phrases: signalPhrases(entry.source),
      signalScore: Math.max(
        ...signalPhrases(entry.source).map((candidate) => candidate.score),
        0,
      ),
      topicScore: polarity === "positive"
        ? Number(entry.searchedAs === "launch")
        : Number(entry.searchedAs === "risk") * 2 +
          Number(entry.searchedAs === "financial"),
      contextScore: contextRelevanceScore(entry.source, contextTerms),
      publishedAt: new Date(entry.source.publishedAt ?? 0).getTime(),
    }))
    .filter((candidate) => candidate.phrases.length > 0)
    .sort((a, b) =>
      b.signalScore - a.signalScore ||
      b.topicScore - a.topicScore ||
      b.contextScore - a.contextScore ||
      b.publishedAt - a.publishedAt ||
      a.index - b.index,
    );

  const selected = candidates[0];
  if (!selected) {
    return {
      text: `No clear ${polarity} signal was found in ${scopeLabel}.`,
      sourceIds: [],
    };
  }

  const source = selected.entry.source;
  const line = selected.phrases[0]?.phrase || cleanSourceTitle(source);
  const labeledLine = source.affiliatedCompanyReport
    ? `Company report: ${line}`
    : line;
  return {
    text: labeledLine.length > 130
      ? `${labeledLine.slice(0, 127).trimEnd()}…`
      : labeledLine,
    sourceIds: [source.id],
  };
}

function buildBriefingContent(
  subject: string,
  subjectType: "company" | "person",
  context: string | undefined,
  topics: BriefingTopic[],
  sources: SearchResult[],
  companyName: string | null,
): {
  overview: {
    text: string;
    sourceIds: string[];
    topPositive: BriefingSignal;
    topNegative: BriefingSignal;
  };
  highlights: {
    category: BriefingTopic;
    title: string;
    summary: string;
    sourceIds: string[];
  }[];
  questions: { text: string; sourceIds: string[] }[];
  topicBriefs: {
    category: BriefingTopic;
    text: string;
    sourceIds: string[];
    topPositive: BriefingSignal;
    topNegative: BriefingSignal;
  }[];
} {
  const contextTerms = getContextTerms(context);
  const researchLabel =
    subjectType === "person" && companyName
      ? `${subject} or ${companyName}`
      : subject;
  const highlights = sources.flatMap(({ source, searchedAs }) => {
    const category = classifySource(source, searchedAs, topics);
    const rawSummary =
      source.snippet ||
      `This report was published by ${source.publisher}${source.publishedAt ? ` on ${new Date(source.publishedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}` : ""}.`;
    return category ? [{
      category,
      title: source.title,
      summary: source.affiliatedCompanyReport
        ? `Company-level report for ${companyName}: ${rawSummary}`
        : rawSummary,
      sourceIds: [source.id],
    }] : [];
  });
  const latest = sources.length
    ? sources.reduce((newest, candidate) =>
      new Date(candidate.source.publishedAt ?? 0).getTime() >
      new Date(newest.source.publishedAt ?? 0).getTime()
        ? candidate
        : newest,
    ).source
    : undefined;
  const matchingSources = context
    ? sources
      .filter(({ source }) => contextRelevanceScore(source, contextTerms) > 0)
      .slice(0, 2)
    : [];
  const topPositive = buildTopSignal(
    sources,
    contextTerms,
    "positive",
  );
  const topNegative = buildTopSignal(
    sources,
    contextTerms,
    "negative",
  );
  const normalizedContext = context?.replace(/\s+/g, " ").trim();
  const shortContext = normalizedContext && normalizedContext.length > 100
    ? `${normalizedContext.slice(0, 97)}…`
    : normalizedContext;
  const sourceExcerpt = (source: NewsItem) => {
    const publisher = source.publisher.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const cleanTitle = source.title.replace(
      new RegExp(`\\s*(?:-|–|—|\\|)\\s*${publisher}\\s*$`, "i"),
      "",
    );
    const snippet = source.snippet.replace(/\s+/g, " ").trim();
    const duplicateSnippet =
      snippet.toLocaleLowerCase().includes(cleanTitle.toLocaleLowerCase()) ||
      snippet.toLocaleLowerCase().endsWith(source.publisher.toLocaleLowerCase());
    const excerpt = snippet && !duplicateSnippet ? snippet : cleanTitle;
    if (excerpt.length <= 125) return excerpt;
    return `${excerpt.slice(0, 122).trimEnd()}…`;
  };
  const answerSources = matchingSources.length ? matchingSources : sources.slice(0, 2);
  const overviewText = context
    ? matchingSources.length
      ? `For “${shortContext}” related to ${researchLabel}, the closest recent public ${answerSources.length === 1 ? "report is" : "reports are"}: ${answerSources.map(({ source }) => `${source.affiliatedCompanyReport ? "Company report: " : ""}“${sourceExcerpt(source)}”`).join(" ")}`
      : sources.length
        ? `No recent public report directly matched “${shortContext}” related to ${researchLabel}. These are the closest selected-topic reports found in the 30-day window.`
        : `No recent public report matched “${shortContext}” related to ${researchLabel} in the 30-day window.`
    : latest
      ? `Recent public reporting related to ${researchLabel} includes ${sources.length} reports from the 30-day research window. The latest report is “${latest.title},” published by ${latest.publisher}.`
      : `No recent public reports were found for ${researchLabel} in the selected topics during the 30-day research window.`;
  const topicLabels: Record<BriefingTopic, string> = {
    news: "news",
    hire: "hire",
    launch: "launch",
    financial: "financial",
    risk: "risk",
  };
  const topicBriefs = topics.map((category) => {
    const topicSources = sources.filter(
      ({ source, searchedAs }) => classifySource(source, searchedAs, topics) === category,
    );
    const latestTopicSource = topicSources.reduce<SearchResult | undefined>(
      (newest, candidate) =>
        !newest ||
        new Date(candidate.source.publishedAt ?? 0).getTime() >
          new Date(newest.source.publishedAt ?? 0).getTime()
          ? candidate
          : newest,
      undefined,
    );
    const label = topicLabels[category];
    return {
      category,
      text: latestTopicSource
        ? `The 30-day ${label} tab has ${topicSources.length} sourced report${topicSources.length === 1 ? "" : "s"} related to ${researchLabel}. Latest: “${latestTopicSource.source.title}.”`
        : category === "hire"
          ? `No confirmed-hire reports related to ${researchLabel} were found in the 30-day public-news crawl.`
          : `No ${label} reports related to ${researchLabel} were found in the 30-day window.`,
      sourceIds: latestTopicSource ? [latestTopicSource.source.id] : [],
      topPositive: buildTopSignal(
        topicSources,
        contextTerms,
        "positive",
        `the 30-day ${label} reports for ${subject}`,
      ),
      topNegative: buildTopSignal(
        topicSources,
        contextTerms,
        "negative",
        `the 30-day ${label} reports for ${subject}`,
      ),
    };
  });
  const riskHighlights = highlights.filter((highlight) => highlight.category === "risk");
  const questions = topics.includes("risk") ? riskHighlights.slice(0, 3).map((highlight, index) => ({
    text: [
      `What has changed since “${highlight.title}” was reported, and what is the latest status?`,
      `What should we understand about the next steps related to “${highlight.title}”?`,
      `How does “${highlight.title}” affect the priorities for this conversation?`,
    ][index]!,
    sourceIds: highlight.sourceIds,
  })) : [];

  if (topics.includes("risk") && context && !questions.some((question) => question.text.includes(context))) {
    questions.push({
      text: `How does the meeting context (“${context}”) affect the risks to review?`,
      sourceIds: riskHighlights.slice(0, 2).flatMap((highlight) => highlight.sourceIds),
    });
  }

  return {
    overview: {
      text: overviewText,
      sourceIds: context
        ? answerSources.map(({ source }) => source.id)
        : latest ? [latest.id] : [],
      topPositive,
      topNegative,
    },
    highlights,
    questions,
    topicBriefs,
  };
}

router.post("/briefings", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in before using the briefing search." });
    return;
  }

  const input = CreateBriefingBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({
      error: "Enter a four-digit PIN, company or person, required person details, at least one topic, and meeting time.",
    });
    return;
  }
  if (new Set(input.data.topics).size !== input.data.topics.length) {
    res.status(400).json({
      error: "Select each topic tab only once so it receives one search request.",
    });
    return;
  }

  const ownerEmail = process.env.BRIEFING_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) {
    res.status(503).json({
      error: "The allowed briefing owner is not configured in API Server Secrets.",
    });
    return;
  }
  let ownerUserId: string | null;
  try {
    ownerUserId = await resolveOwnerUserId(ownerEmail);
  } catch (error) {
    req.log.error({ error }, "Failed to verify the briefing owner account");
    res.status(503).json({
      error: "The briefing owner account could not be verified with Clerk.",
    });
    return;
  }
  if (!ownerUserId) {
    res.status(503).json({
      error: "The configured briefing owner was not found in this Clerk environment.",
    });
    return;
  }
  if (userId !== ownerUserId) {
    res.status(403).json({
      error: "Only the configured briefing owner can start a crawl.",
    });
    return;
  }

  const configuredStartPin = process.env.BRIEFING_START_PIN?.trim();
  if (!configuredStartPin || !/^\d{4}$/.test(configuredStartPin)) {
    res.status(503).json({
      error: "The briefing start PIN is not configured in the API Server secrets.",
    });
    return;
  }
  const lockSeconds = startPinLockSeconds(userId);
  if (lockSeconds > 0) {
    res.setHeader("Retry-After", String(lockSeconds));
    res.status(429).json({
      error: "Too many incorrect PIN attempts. Try again after the lockout period.",
    });
    return;
  }
  const suppliedPin = Buffer.from(input.data.startPin, "utf8");
  const expectedPin = Buffer.from(configuredStartPin, "utf8");
  if (
    suppliedPin.length !== expectedPin.length ||
    !timingSafeEqual(suppliedPin, expectedPin)
  ) {
    const retryAfter = recordStartPinFailure(userId);
    if (retryAfter > 0) {
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: "Too many incorrect PIN attempts. Try again after the lockout period.",
      });
      return;
    }
    res.status(403).json({ error: "The start PIN is incorrect." });
    return;
  }
  startPinFailures.delete(userId);

  if (input.data.subjectType === "person" && !input.data.personRole) {
    res.status(400).json({ error: "Choose a briefing context for the person: Chairman / CEO, MP, or Corporate." });
    return;
  }
  if (input.data.subjectType === "company" && input.data.personRole) {
    res.status(400).json({ error: "Person briefing context is only available for Person briefs." });
    return;
  }
  if (
    input.data.subjectType === "company" &&
    (input.data.publicRoleTitle || input.data.companyName)
  ) {
    res.status(400).json({ error: "Person role details are only available for Person briefs." });
    return;
  }
  const companyName =
    input.data.subjectType === "person" && input.data.personRole === "business_owner"
      ? input.data.companyName?.trim() || null
      : null;
  const publicRoleTitle =
    input.data.subjectType === "person" && input.data.personRole === "mp"
      ? input.data.publicRoleTitle?.trim() || "MP"
      : null;
  if (input.data.personRole === "business_owner" && !companyName) {
    res.status(400).json({ error: "Enter the Chairman / CEO's company." });
    return;
  }
  if (input.data.subjectType === "company" && input.data.sourceMode === "private") {
    res.status(400).json({ error: "Company briefs use public sources only." });
    return;
  }
  if (input.data.sourceMode === "private") {
    res.status(503).json({
      error: "Private source access is not configured. No mailbox or WhatsApp data was read.",
    });
    return;
  }

  let apiKey: string | null;
  const projectApiKey = process.env.TAVILY_API_KEY?.trim();
  if (projectApiKey) {
    // This branch is reached only after the server has verified the configured owner account.
    apiKey = projectApiKey;
  } else {
    try {
      apiKey = await getUserTavilyApiKey(userId);
    } catch {
      req.log.error({}, "User Tavily credential is unavailable or cannot be decrypted");
      res.status(503).json({
        error: "Secure Tavily key storage is unavailable. No search request was sent.",
      });
      return;
    }
  }
  if (!apiKey) {
    res.status(503).json({
      error: "No Tavily key is available for the configured owner account. Configure the owner key or save a personal Tavily key.",
    });
    return;
  }

  const quota = await reserveTavilyQuota(userId, input.data.topics.length);
  if (!quota.allowed || quota.reservationId === null) {
    if (quota.reason === "active-crawl") {
      res.status(429).json({
        error: "A Tavily crawl is already using the shared app allowance. Wait for it to finish before starting another.",
      });
      return;
    }
    if (quota.reason === "daily-start-limit") {
      res.status(429).json({
        error: `The configured developer account has reached ${TAVILY_DAILY_CRAWL_START_LIMIT} crawl starts for today's IST calendar day. It resets at midnight IST.`,
      });
      return;
    }
    if (quota.reason === "daily-search-limit") {
      res.status(429).json({
        error: `Only ${quota.dailySearchRequestsRemaining} of today's ${TAVILY_DAILY_SEARCH_REQUEST_LIMIT} Tavily search requests remain for the configured developer account. Select fewer topic tabs or try again after midnight IST.`,
      });
      return;
    }
    const resetNote = quota.resetsAt
      ? ` It resets at ${quota.resetsAt.toLocaleString("en-IN", { timeZone: TAVILY_QUOTA_TIME_ZONE })} IST.`
      : " It resets at midnight IST.";
    res.status(429).json({
      error: `The shared two-minute Tavily allowance for today's calendar day is used.${resetNote}`,
    });
    return;
  }

  let requestRateLimit: Awaited<ReturnType<typeof reserveTavilyRequestSlots>>;
  try {
    requestRateLimit = await reserveTavilyRequestSlots(input.data.topics.length);
  } catch (error) {
    req.log.error({ error }, "Failed to reserve Tavily request rate-limit slots");
    await cancelTavilyQuotaReservation(userId, quota.reservationId)
      .catch((cancelError) => {
        req.log.error({ error: cancelError }, "Failed to release Tavily crawl quota");
      });
    res.status(503).json({
      error: "The Tavily request limit could not be checked. No search request was sent.",
    });
    return;
  }
  if (!requestRateLimit.allowed) {
    await cancelTavilyQuotaReservation(userId, quota.reservationId)
      .catch((cancelError) => {
        req.log.error({ error: cancelError }, "Failed to release Tavily crawl quota");
      });
    res.setHeader("Retry-After", String(requestRateLimit.retryAfterSeconds));
    res.status(429).json({
      error: `Tavily is limited to ${TAVILY_REQUEST_LIMIT} requests per rolling five minutes across the app. Each selected tab counts once. Try again in ${requestRateLimit.retryAfterSeconds} seconds.`,
    });
    return;
  }

  const crawlStartedAt = Date.now();
  const crawlController = new AbortController();
  let stopReason: "daily-budget" | "hard-stop" | null = null;
  let quotaSettled = false;
  const settleQuota = async () => {
    if (quotaSettled || quota.reservationId === null) return;
    quotaSettled = true;
    const durationMs = Math.min(quota.remainingMs, Date.now() - crawlStartedAt);
    await finishTavilyQuotaReservation(userId, quota.reservationId, durationMs);
  };
  const dailyBudgetTimer = setTimeout(() => {
    stopReason = "daily-budget";
    crawlController.abort(new Error("The rolling daily Tavily allowance has been reached."));
  }, quota.remainingMs);
  const hardStopTimer = setTimeout(() => {
    stopReason = "hard-stop";
    crawlController.abort(new Error("The three-minute Tavily crawl hard stop has been reached."));
  }, TAVILY_CRAWL_HARD_STOP_MS);

  try {
    const now = new Date();
    const meetingAt = input.data.meetingAt;
    const windowEnd = now;
    const windowStart = new Date(windowEnd.getTime() - 30 * 86_400_000);
    const topics = input.data.topics as BriefingTopic[];
    const searchResult = await searchNews(
      input.data.subject.trim(),
      input.data.subjectType,
      input.data.personRole,
      topics,
      apiKey,
      windowStart,
      windowEnd,
      input.data.context?.trim() || undefined,
      publicRoleTitle,
      companyName,
      crawlController.signal,
    );
    if (stopReason) {
      await settleQuota();
      if (stopReason === "daily-budget") {
        res.status(429).json({
          error: "This crawl used today's remaining two-minute Tavily allowance and was stopped.",
        });
      } else {
        res.status(504).json({
          error: "The crawl reached its three-minute backup hard stop.",
        });
      }
      return;
    }
    await settleQuota();
    const collected = searchResult.sources;

    const relevant = collected.filter(({ source, searchedAs }) =>
      classifySource(source, searchedAs, topics) !== null,
    );

    const content = buildBriefingContent(
      input.data.subject.trim(),
      input.data.subjectType,
      input.data.context?.trim() || undefined,
      topics,
      relevant,
      companyName,
    );
    const sources = relevant.map(({ source }) => source);

    const result = CreateBriefingResponse.parse({
      briefingId: randomUUID(),
      subject: input.data.subject.trim(),
      subjectType: input.data.subjectType,
      personRole: input.data.personRole,
      publicRoleTitle,
      companyName,
      sourceMode: "public",
      topics,
      meetingAt: meetingAt.toISOString(),
      generatedAt: now.toISOString(),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      searchCreditsUsed: searchResult.creditsUsed,
      sourceSearchesCompleted: searchResult.searchesCompleted,
      searchResultsReturned: searchResult.resultsReturned,
      ...content,
      sources,
    });
    res.json(result);
  } catch (error) {
    try {
      await settleQuota();
    } catch (settleError) {
      req.log.error({ error: settleError }, "Failed to save Tavily crawl usage");
      res.status(503).json({
        error: "Crawl usage could not be saved safely. Please try again later.",
      });
      return;
    }
    if (stopReason === "daily-budget") {
      res.status(429).json({
        error: "This crawl used today's remaining two-minute Tavily allowance and was stopped.",
      });
      return;
    }
    if (stopReason === "hard-stop") {
      res.status(504).json({
        error: "The crawl reached its three-minute backup hard stop.",
      });
      return;
    }
    if (error instanceof BriefingSearchFailure) {
      req.log.error(
        {
          completedSearches: error.searchesCompleted,
          failedSearches: error.statuses.length,
          statusCodes: error.statuses,
          creditsReported: error.creditsUsed,
        },
        "Tavily briefing search failed",
      );
      const credentialsRejected = error.statuses.some((status) =>
        [401, 403, 432, 433, 434].includes(status),
      );
      const creditNote = error.creditsUsed === null
        ? "Credit use for completed searches could not be confirmed."
        : `Tavily reported ${error.creditsUsed} credit${error.creditsUsed === 1 ? "" : "s"} for completed searches; check its dashboard for final usage.`;
      res.status(502).json({
        error: `${credentialsRejected ? "Tavily rejected the API key or account limit." : "Some Tavily searches failed."} ${creditNote} Check the key and dashboard before retrying.`,
      });
      return;
    }
    req.log.error(
      { sourceMode: input.data.sourceMode, error },
      "Briefing generation failed",
    );
    res.status(502).json({
      error: "The briefing could not be generated. Please try again shortly.",
    });
  } finally {
    clearTimeout(dailyBudgetTimer);
    clearTimeout(hardStopTimer);
  }
});

export default router;
