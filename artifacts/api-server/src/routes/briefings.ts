// Copyright 2026 Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import {
  CreateBriefingBody,
  CreateBriefingResponse,
  GetBriefingSourceStatusResponse,
} from "@workspace/api-zod";
import { getAuth } from "@clerk/express";
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
import { resolveOwnerUserId } from "../lib/briefing-owner";
import { verifyBriefingStartPin } from "../lib/briefing-start-pin";
import { generateAiBriefingSummaries } from "../lib/ai-briefing-summary";
import { getUserAiConfig } from "../lib/user-ai-credentials";
import {
  getAiGuardrailStatus,
  reserveAiBriefingRequest,
} from "./ai-guardrails";
import {
  getSapConfigurationStatus,
  searchSapS4Hana,
  SAP_AREA_LABELS,
  SAP_BRIEFING_HARD_STOP_MS,
  SAP_BRIEFING_LIMIT_MS,
} from "../lib/sap-s4hana";

const router: IRouter = Router();
let sapBriefingActive = false;

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

async function getOptionalAiSummaries(input: {
  enabled: boolean;
  userId: string;
  briefingId: string;
  subject: string;
  topics: BriefingTopic[];
  publicSources: SearchResult[];
}): Promise<{
  aiSummaries: Awaited<ReturnType<typeof generateAiBriefingSummaries>>["summaries"];
  aiSummaryNotice: string | null;
}> {
  if (!input.enabled) return { aiSummaries: [], aiSummaryNotice: null };
  try {
    const config = await getUserAiConfig(input.userId);
    const evidenceByTopic = Object.fromEntries(input.topics.map((topic) => [
      topic,
      input.publicSources
        .filter(({ source, searchedAs }) =>
          classifySource(source, searchedAs, input.topics) === topic,
        )
        .map(({ source }) => ({
          id: source.id,
          title: source.title,
          publisher: source.publisher,
          publishedAt: source.publishedAt,
          snippet: source.snippet,
        })),
    ]));
    const result = await generateAiBriefingSummaries({
      userId: input.userId,
      briefingId: input.briefingId,
      subject: input.subject,
      topics: input.topics,
      evidenceByTopic,
      config,
      reserveRequest: reserveAiBriefingRequest,
    });
    return {
      aiSummaries: result.summaries,
      aiSummaryNotice: result.failedCategories.length
        ? "Some selected AI summaries could not be generated. The source-based briefing is still available."
        : null,
    };
  } catch {
    return {
      aiSummaries: [],
      aiSummaryNotice:
        "AI summaries could not be generated. The source-based briefing is still available.",
    };
  }
}

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
  const sapStatus = await getSapConfigurationStatus(
    canStart ? userId ?? undefined : undefined,
  );
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
    sapConfigured: sapStatus.configured,
    sapAvailableAreas: sapStatus.availableAreas,
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
  sourceMode: "public" | "sap" = "public",
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
  const evidenceLabel = sourceMode === "sap" ? "SAP S/4HANA records" : "public reports";
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
    `the selected ${evidenceLabel}`,
  );
  const topNegative = buildTopSignal(
    sources,
    contextTerms,
    "negative",
    `the selected ${evidenceLabel}`,
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
      ? `For “${shortContext}” related to ${researchLabel}, the closest recent ${evidenceLabel} ${answerSources.length === 1 ? "is" : "are"}: ${answerSources.map(({ source }) => `${source.affiliatedCompanyReport ? "Company-level: " : ""}“${sourceExcerpt(source)}”`).join(" ")}`
      : sources.length
        ? `No recent ${sourceMode === "sap" ? "SAP record" : "public report"} directly matched “${shortContext}” related to ${researchLabel}. These are the closest selected-topic sources found in the 30-day window.`
        : `No recent ${sourceMode === "sap" ? "SAP record" : "public report"} matched “${shortContext}” related to ${researchLabel} in the 30-day window.`
    : latest
      ? `The 30-day ${evidenceLabel} for ${researchLabel} include ${sources.length} sourced record${sources.length === 1 ? "" : "s"}. Latest: “${latest.title},” recorded by ${latest.publisher}.`
      : `No recent ${sourceMode === "sap" ? "SAP records" : "public reports"} were found for ${researchLabel} in the selected topics during the 30-day research window.`;
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
        ? `The 30-day ${label} tab has ${topicSources.length} sourced record${topicSources.length === 1 ? "" : "s"} related to ${researchLabel}. Latest: “${latestTopicSource.source.title}.”`
        : category === "hire"
          ? `No confirmed-hire ${sourceMode === "sap" ? "records" : "reports"} related to ${researchLabel} were found in the 30-day ${sourceMode === "sap" ? "SAP source" : "public-news crawl"}.`
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
      error: "Enter a four-digit PIN, company or person, required person details, and at least one topic.",
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

  const pinCheck = verifyBriefingStartPin(userId, input.data.startPin);
  if (!pinCheck.valid) {
    if (pinCheck.retryAfterSeconds) {
      res.setHeader("Retry-After", String(pinCheck.retryAfterSeconds));
    }
    res.status(pinCheck.status).json({ error: pinCheck.message });
    return;
  }

  if (input.data.useAi === true) {
    let aiStatus: Awaited<ReturnType<typeof getAiGuardrailStatus>>;
    try {
      aiStatus = await getAiGuardrailStatus(userId);
    } catch {
      res.status(503).json({
        error: "AI readiness could not be checked. No Tavily search was sent.",
      });
      return;
    }
    if (!aiStatus.serverEnabled || !aiStatus.activated || !aiStatus.aiProviderConnected) {
      res.status(409).json({
        error: "AI is off or not ready for this account. Turn off AI for this brief, or complete the AI setup and activation first. No Tavily search was sent.",
      });
      return;
    }
  }

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

  if (input.data.sourceMode !== "sap" && (input.data.sapAreas?.length ?? 0) > 0) {
    res.status(400).json({
      error: "Choose SAP S/4HANA as the source before selecting SAP data areas.",
    });
    return;
  }

  if (input.data.sourceMode === "sap") {
    const sapAreas = input.data.sapAreas ?? [];
    if (sapAreas.length === 0) {
      res.status(400).json({
        error: "Select at least one SAP data area.",
      });
      return;
    }
    const organization =
      input.data.subjectType === "company"
        ? input.data.subject.trim()
        : companyName;
    if (!organization) {
      res.status(400).json({
        error: "SAP briefs need a company scope. Select a Company brief or add the Chairman / CEO's company.",
      });
      return;
    }
    const sapStatus = await getSapConfigurationStatus(userId);
    if (!sapStatus.configured || sapStatus.availableAreas.length === 0) {
      res.status(503).json({
        error: "SAP setup is incomplete. Configure the connection and at least one mapped SAP area before selecting SAP. No sources were requested.",
      });
      return;
    }
    const unavailableAreas = sapAreas.filter(
      (area) => !sapStatus.availableAreas.includes(area),
    );
    if (unavailableAreas.length > 0) {
      res.status(403).json({
        error: `These SAP areas are not enabled for the approved connection: ${unavailableAreas.map((area) => SAP_AREA_LABELS[area]).join(", ")}.`,
      });
      return;
    }
    let tavilyApiKey: string | null;
    const projectApiKey = process.env.TAVILY_API_KEY?.trim();
    if (projectApiKey) {
      // This branch is reached only after the server has verified the configured owner account.
      tavilyApiKey = projectApiKey;
    } else {
      try {
        tavilyApiKey = await getUserTavilyApiKey(userId);
      } catch (error) {
        req.log.error({ error }, "User Tavily credential is unavailable or cannot be decrypted for SAP research");
        res.status(503).json({
          error: "Secure Tavily key storage is unavailable. No SAP or public-source request was sent.",
        });
        return;
      }
    }
    if (!tavilyApiKey) {
      res.status(503).json({
        error: "SAP briefs require an active Tavily key for public research. Add a Tavily key in its separate settings box; no SAP or public-source request was sent.",
      });
      return;
    }
    if (sapBriefingActive) {
      res.status(429).json({
        error: "A combined Tavily and SAP briefing is already running. Wait for it to finish before starting another.",
      });
      return;
    }

    const topics = input.data.topics as BriefingTopic[];
    let quota: Awaited<ReturnType<typeof reserveTavilyQuota>>;
    try {
      quota = await reserveTavilyQuota(userId, topics.length);
    } catch (error) {
      req.log.error({ error }, "Failed to reserve the Tavily allowance for an SAP briefing");
      res.status(503).json({
        error: "Tavily usage limits could not be checked. No source request was sent.",
      });
      return;
    }
    if (!quota.allowed || quota.reservationId === null) {
      if (quota.reason === "active-crawl") {
        res.status(429).json({
          error: "A Tavily briefing event is already using the shared app allowance. Wait for it to finish before starting another.",
        });
        return;
      }
      if (quota.reason === "daily-start-limit") {
        res.status(429).json({
          error: `The configured developer account has reached ${TAVILY_DAILY_CRAWL_START_LIMIT} briefing events for today's IST calendar day. It resets at midnight IST.`,
        });
        return;
      }
      if (quota.reason === "daily-search-limit") {
        res.status(429).json({
          error: `This account does not have enough daily Tavily searches remaining for the ${topics.length} selected topics. Reduce the selected topics or try after the IST reset.`,
        });
        return;
      }
      res.status(429).json({
        error: "The two-minute Tavily allowance for this briefing was reached.",
      });
      return;
    }

    let requestRateLimit: Awaited<ReturnType<typeof reserveTavilyRequestSlots>>;
    try {
      requestRateLimit = await reserveTavilyRequestSlots(topics.length);
    } catch (error) {
      req.log.error({ error }, "Failed to reserve Tavily request-rate slots for an SAP briefing");
      await cancelTavilyQuotaReservation(userId, quota.reservationId)
        .catch((cancelError) => {
          req.log.error({ error: cancelError }, "Failed to release the SAP briefing Tavily quota");
        });
      res.status(503).json({
        error: "The Tavily request limit could not be checked. No source request was sent.",
      });
      return;
    }
    if (!requestRateLimit.allowed) {
      await cancelTavilyQuotaReservation(userId, quota.reservationId)
        .catch((cancelError) => {
          req.log.error({ error: cancelError }, "Failed to release the SAP briefing Tavily quota");
        });
      res.setHeader("Retry-After", String(requestRateLimit.retryAfterSeconds));
      res.status(429).json({
        error: `Tavily is limited to ${TAVILY_REQUEST_LIMIT} requests per rolling five minutes across the app. Each selected topic counts once. Try again in ${requestRateLimit.retryAfterSeconds} seconds.`,
      });
      return;
    }

    sapBriefingActive = true;
    const crawlController = new AbortController();
    let stopReason: "time-limit" | "hard-stop" | null = null;
    const crawlStartedAt = Date.now();
    let quotaSettled = false;
    const settleQuota = async () => {
      if (quotaSettled || quota.reservationId === null) return;
      const durationMs = Math.min(TAVILY_DAILY_LIMIT_MS, Date.now() - crawlStartedAt);
      await finishTavilyQuotaReservation(userId, quota.reservationId, durationMs);
      quotaSettled = true;
    };
    const durationTimer = setTimeout(() => {
      stopReason = "time-limit";
      crawlController.abort(new Error("SAP briefing reached its two-minute limit."));
    }, SAP_BRIEFING_LIMIT_MS);
    const hardStopTimer = setTimeout(() => {
      stopReason = "hard-stop";
      crawlController.abort(new Error("SAP briefing reached its three-minute hard stop."));
    }, SAP_BRIEFING_HARD_STOP_MS);

    try {
      const now = new Date();
      const meetingAt = input.data.meetingAt ?? null;
      const windowEnd = now;
      const windowStart = new Date(windowEnd.getTime() - 30 * 86_400_000);
      const [tavilyResult, sapResult] = await Promise.all([
        searchNews(
          input.data.subject.trim(),
          input.data.subjectType,
          input.data.personRole,
          topics,
          tavilyApiKey,
          windowStart,
          windowEnd,
          input.data.context?.trim() || undefined,
          publicRoleTitle,
          companyName,
          crawlController.signal,
        ),
        searchSapS4Hana({
          userId,
          areas: sapAreas,
          topics,
          organization,
          windowStart,
          windowEnd,
          affiliatedCompanyReport: input.data.subjectType === "person",
          signal: crawlController.signal,
        }),
      ]);
      if (stopReason) {
        await settleQuota();
        res.status(504).json({
          error: stopReason === "time-limit"
            ? "This combined Tavily and SAP briefing reached its two-minute collection limit and was stopped."
            : "The combined briefing reached its three-minute backup hard stop.",
        });
        return;
      }
      await settleQuota();

      const publicSources = tavilyResult.sources.filter(({ source, searchedAs }) =>
        classifySource(source, searchedAs, topics) !== null,
      );
      const relevantSapSources = sapResult.sources.filter(({ source, searchedAs }) =>
        classifySource(source, searchedAs, topics) !== null,
      );
      const content = buildBriefingContent(
        input.data.subject.trim(),
        input.data.subjectType,
        input.data.context?.trim() || undefined,
        topics,
        publicSources,
        companyName,
      );
      const dataSourceIds = sapResult.sapData.slice(0, 3).flatMap((item) => item.sourceIds);
      const returnedAreaCount = new Set(sapResult.sapData.map((item) => item.area)).size;
      const publicSummary = publicSources.length
        ? `Tavily found ${publicSources.length} cited public result${publicSources.length === 1 ? "" : "s"} for the selected topics.`
        : "Tavily found no cited public results for the selected topics.";
      const sapSummary = sapResult.sapData.length
        ? `SAP S/4HANA returned ${sapResult.sapData.length} cited record${sapResult.sapData.length === 1 ? "" : "s"} across ${returnedAreaCount} selected data area${returnedAreaCount === 1 ? "" : "s"} for ${organization}.`
        : `No SAP records matched the selected areas and topics for ${organization}.`;
      content.overview.text = `${publicSummary} ${sapSummary}`;
      content.overview.sourceIds = [...new Set([
        ...publicSources.slice(0, 2).map(({ source }) => source.id),
        ...dataSourceIds,
      ])].slice(0, 6);
      const combinedSources = [...publicSources, ...relevantSapSources]
        .map(({ source }) => source)
        .filter((source, index, all) =>
          all.findIndex((candidate) => candidate.id === source.id) === index,
        );
      const briefingId = randomUUID();
      const aiSummaryFields = await getOptionalAiSummaries({
        enabled: input.data.useAi === true,
        userId,
        briefingId,
        subject: input.data.subject.trim(),
        topics,
        publicSources,
      });

      const result = CreateBriefingResponse.parse({
        briefingId,
        subject: input.data.subject.trim(),
        subjectType: input.data.subjectType,
        personRole: input.data.personRole,
        publicRoleTitle,
        companyName,
        sourceMode: "sap",
        sapAreas,
        topics,
        meetingAt: meetingAt?.toISOString() ?? null,
        generatedAt: now.toISOString(),
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        searchCreditsUsed: tavilyResult.creditsUsed,
        sourceSearchesCompleted: sapResult.requestsCompleted,
        searchResultsReturned: tavilyResult.resultsReturned + sapResult.resultsReturned,
        ...content,
        ...aiSummaryFields,
        sources: combinedSources,
        sapData: sapResult.sapData,
      });
      res.json(result);
    } catch (error) {
      crawlController.abort(error);
      try {
        await settleQuota();
      } catch (settleError) {
        req.log.error({ error: settleError }, "Failed to save combined Tavily and SAP usage");
        res.status(503).json({
          error: "Tavily usage could not be saved safely. Check the connection before retrying.",
        });
        return;
      }
      if (stopReason) {
        res.status(504).json({
          error: stopReason === "time-limit"
            ? "This combined Tavily and SAP briefing reached its two-minute collection limit and was stopped."
            : "The combined briefing reached its three-minute backup hard stop.",
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
          "Tavily public research failed during an SAP briefing",
        );
        const credentialsRejected = error.statuses.some((status) =>
          [401, 403, 432, 433, 434].includes(status),
        );
        const creditNote = error.creditsUsed === null
          ? "Credit use for completed searches could not be confirmed."
          : `Tavily reported ${error.creditsUsed} credit${error.creditsUsed === 1 ? "" : "s"} for completed searches; check its dashboard for final usage.`;
        res.status(502).json({
          error: `${credentialsRejected ? "Tavily rejected the active API key or account limit." : "Some Tavily public searches failed."} ${creditNote} SAP records were not included; check the Tavily connection before retrying.`,
        });
        return;
      }
      req.log.error(
        {
          areaCount: sapAreas.length,
          errorName: error instanceof Error ? error.name : "unknown",
          stopReason,
        },
        "Combined Tavily and SAP briefing request failed",
      );
      res.status(502).json({
        error: "SAP or public Tavily data could not be collected. Check both connections and try again.",
      });
    } finally {
      clearTimeout(durationTimer);
      clearTimeout(hardStopTimer);
      sapBriefingActive = false;
    }
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
        error: `The configured developer account has reached ${TAVILY_DAILY_CRAWL_START_LIMIT} briefing events for today's IST calendar day. It resets at midnight IST.`,
      });
      return;
    }
    if (quota.reason === "daily-search-limit") {
      res.status(429).json({
        error: `This account does not have enough daily Tavily searches remaining for the ${input.data.topics.length} selected topics. Reduce the selected topics or try after the IST reset.`,
      });
      return;
    }
    res.status(429).json({
      error: "The two-minute Tavily limit for this briefing was reached.",
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
    const durationMs = Math.min(TAVILY_DAILY_LIMIT_MS, Date.now() - crawlStartedAt);
    await finishTavilyQuotaReservation(userId, quota.reservationId, durationMs);
  };
  const dailyBudgetTimer = setTimeout(() => {
    stopReason = "daily-budget";
    crawlController.abort(new Error("The two-minute per-briefing Tavily limit has been reached."));
  }, TAVILY_DAILY_LIMIT_MS);
  const hardStopTimer = setTimeout(() => {
    stopReason = "hard-stop";
    crawlController.abort(new Error("The three-minute Tavily crawl hard stop has been reached."));
  }, TAVILY_CRAWL_HARD_STOP_MS);

  try {
    const now = new Date();
    const meetingAt = input.data.meetingAt ?? null;
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
          error: "This briefing reached its two-minute Tavily crawl limit and was stopped.",
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
    const briefingId = randomUUID();
    const aiSummaryFields = await getOptionalAiSummaries({
      enabled: input.data.useAi === true,
      userId,
      briefingId,
      subject: input.data.subject.trim(),
      topics,
      publicSources: relevant,
    });

    const result = CreateBriefingResponse.parse({
      briefingId,
      subject: input.data.subject.trim(),
      subjectType: input.data.subjectType,
      personRole: input.data.personRole,
      publicRoleTitle,
      companyName,
      sourceMode: "public",
      sapAreas: [],
      topics,
      meetingAt: meetingAt?.toISOString() ?? null,
      generatedAt: now.toISOString(),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      searchCreditsUsed: searchResult.creditsUsed,
      sourceSearchesCompleted: searchResult.searchesCompleted,
      searchResultsReturned: searchResult.resultsReturned,
      ...content,
      ...aiSummaryFields,
      sources,
      sapData: [],
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
        error: "This briefing reached its two-minute Tavily crawl limit and was stopped.",
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
