import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import {
  CreateBriefingBody,
  CreateBriefingResponse,
  GetBriefingSourceStatusResponse,
} from "@workspace/api-zod";
import { searchTavily, TavilySearchError } from "../lib/tavily";

const router: IRouter = Router();

type NewsItem = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  snippet: string;
};

type BriefingTopic = "news" | "hire" | "launch" | "financial" | "risk";
type PersonRole = "business_owner" | "mp" | "corporate";
type SearchResult = { source: NewsItem; searchedAs: BriefingTopic };
type SearchNewsResult = {
  sources: SearchResult[];
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

function sourceMentionsSubject(source: NewsItem, subject: string): boolean {
  const normalize = (value: string) =>
    (value.match(/[\p{L}\p{N}]+/gu) ?? []).join(" ").toLocaleLowerCase();
  const target = normalize(subject);
  const content = normalize(`${source.title} ${source.snippet}`);
  return target.length > 0 && ` ${content} `.includes(` ${target} `);
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

async function searchNews(
  subject: string,
  subjectType: "company" | "person",
  personRole: PersonRole | null,
  topics: BriefingTopic[],
  start: Date,
  end: Date,
  context?: string,
  publicRoleTitle: string | null = null,
  companyName: string | null = null,
): Promise<SearchNewsResult> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Tavily is not configured. Add TAVILY_API_KEY in Replit Secrets.");
  }

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
  const searchTerms: { topic: BriefingTopic; query: string }[] = topics.map((topic) => {
    const terms: Record<BriefingTopic, string> = {
      news: "recent news coverage",
      hire: "hiring appointed joins named executive open roles",
      launch: "product launch released introduced unveiled",
      financial: subjectType === "company"
        ? "share price earnings profit loss revenue financial results"
        : "financial results investment profit loss funding",
      risk: "risk lawsuit investigation recall regulator fine breach restructuring",
    };
    return { topic, query: `${subject}${personTerms} ${terms[topic]}` };
  });
  const settled = await Promise.allSettled(
    searchTerms.map(async ({ topic, query }) => ({
      topic,
      ...(await searchTavily(query, startDate, endDate, apiKey)),
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

  const uniqueItems = new Map<string, { item: Omit<NewsItem, "id">; searchedAs: BriefingTopic }>();
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
        },
        searchedAs: topic,
      });
    }
  }

  const contextKeywords = getContextTerms(context);
  const sources = [...uniqueItems.values()]
    .map((entry) => ({
      ...entry,
      contextScore: contextRelevanceScore(
        { ...entry.item, id: "", snippet: entry.item.snippet },
        contextKeywords,
      ),
    }))
    .filter(({ item, searchedAs }) =>
      sourceMentionsSubject({ ...item, id: "" }, subject) &&
      classifySource({ ...item, id: "" }, searchedAs, topics) !== null,
    )
    .sort((a, b) =>
      b.contextScore - a.contextScore ||
      new Date(b.item.publishedAt ?? 0).getTime() -
        new Date(a.item.publishedAt ?? 0).getTime(),
    )
    .slice(0, 18)
    .map(({ item, searchedAs }, index) => ({
      source: { ...item, id: `S${index + 1}` },
      searchedAs,
    }));
  return {
    sources,
    creditsUsed,
    searchesCompleted: fulfilled.length,
  };
}

const TOPIC_MATCHERS: Record<Exclude<BriefingTopic, "news">, RegExp> = {
  hire: /\b(?:appointed|appoints|appointment|joins?|joined|hired|hire|hiring|named\s+(?:as|to)|promoted|promotion|new\s+(?:CEO|CFO|CTO|chief executive|president|chair|director))\b/i,
  launch: /\b(?:launch(?:es|ed)?|releas(?:e|es|ed)|introduc(?:e|es|ed|ing)|unveil(?:s|ed)?|debut(?:s|ed)?|roll(?:s)? out|now available)\b/i,
  financial: /\b(?:profit|loss|earnings|revenue|stock|shares?|share price|financial results|quarterly results|valuation|funding|investment|IPO|cost savings)\b/i,
  risk: /\b(?:risk|lawsuit|sues|sued|recall|investigation|probe|regulator|fine|penalty|restructuring|breach|complaint|layoff)\b/i,
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
  /\b(?:record|beat(?:s)? estimates?|stronger|improves?|improvement|profitability)\b/i,
  /\b(?:launch(?:es|ed)?|introduc(?:e|es|ed|ing)|unveil(?:s|ed)?|award(?:ed)?|wins?|won|approved|approval|expansion|expands?|appointed|appointment)\b/i,
];

const NEGATIVE_SIGNAL_PATTERNS = [
  /\b(?:declines?|declined|falls?|fell|drops?|dropped|down|loss(?:es)?|weak(?:ness)?|lower|shortfall)\b/i,
  /\b(?:risk(?:s)?|lawsuit|sues?|sued|investigation|probe|recall|fine|penalt(?:y|ies)|breach|fraud)\b/i,
  /\b(?:layoffs?|cuts?|miss(?:es|ed)? estimates?|debt|delay(?:s|ed)?|slowdown|warning|concern|pressure|closure|shutdown|restructur(?:e|ing))\b/i,
];

router.get("/briefings", (_req, res): void => {
  res.json(GetBriefingSourceStatusResponse.parse({
    provider: "tavily",
    configured: Boolean(process.env.TAVILY_API_KEY?.trim()),
    maxSearchesPerBriefing: 5,
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
  const candidates = sources
    .map((entry, index) => ({
      entry,
      index,
      signalScore: countSignalMatches(
        `${entry.source.title} ${entry.source.snippet}`,
        patterns,
      ),
      topicScore: polarity === "positive"
        ? Number(entry.searchedAs === "launch")
        : Number(entry.searchedAs === "risk") * 2 +
          Number(entry.searchedAs === "financial"),
      contextScore: contextRelevanceScore(entry.source, contextTerms),
      publishedAt: new Date(entry.source.publishedAt ?? 0).getTime(),
    }))
    .filter((candidate) => candidate.signalScore > 0)
    .sort((a, b) =>
      b.signalScore - a.signalScore ||
      b.topicScore - a.topicScore ||
      b.contextScore - a.contextScore ||
      b.publishedAt - a.publishedAt ||
      a.index - b.index,
    );

  const selected = candidates[0]?.entry.source;
  if (!selected) {
    return {
      text: `No clear ${polarity} signal was found in ${scopeLabel}.`,
      sourceIds: [],
    };
  }

  const title = cleanSourceTitle(selected);
  const phrases = [
    ...title.split(/\b(?:despite|but|while|although|however)\b/i),
    ...selected.snippet.split(/(?<=[.!?])\s+/),
  ]
    .map((phrase) => phrase.trim().replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, ""))
    .filter(Boolean)
    .map((phrase) => ({
      phrase,
      score: countSignalMatches(phrase, patterns),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);
  const line = phrases[0]?.phrase || title;
  return {
    text: line.length > 130 ? `${line.slice(0, 127).trimEnd()}…` : line,
    sourceIds: [selected.id],
  };
}

function buildBriefingContent(
  subject: string,
  subjectType: "company" | "person",
  context: string | undefined,
  topics: BriefingTopic[],
  sources: SearchResult[],
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
  const highlights = sources.flatMap(({ source, searchedAs }) => {
    const category = classifySource(source, searchedAs, topics);
    return category ? [{
      category,
      title: source.title,
      summary:
        source.snippet ||
        `This report was published by ${source.publisher}${source.publishedAt ? ` on ${new Date(source.publishedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}` : ""}.`,
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
  const topPositive = buildTopSignal(sources, contextTerms, "positive");
  const topNegative = buildTopSignal(sources, contextTerms, "negative");
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
      ? `For “${shortContext}” about ${subject}, the closest recent public ${answerSources.length === 1 ? "report is" : "reports are"}: ${answerSources.map(({ source }) => `“${sourceExcerpt(source)}”`).join(" ")}`
      : sources.length
        ? `No recent public report directly matched “${shortContext}” about ${subject}. These are the closest selected-topic reports found in the 30-day window.`
        : `No recent public report matched “${shortContext}” about ${subject} in the 30-day window.`
    : latest
      ? `Recent public coverage for this ${subjectType} includes ${sources.length} reports from the 30-day research window. The latest report is “${latest.title},” published by ${latest.publisher}.`
      : `No recent public reports were found for ${subject} in the selected topics during the 30-day research window.`;
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
        ? `The 30-day ${label} tab has ${topicSources.length} sourced report${topicSources.length === 1 ? "" : "s"} for ${subject}. Latest: “${latestTopicSource.source.title}.”`
        : category === "hire"
          ? `No confirmed-hire reports for ${subject} were found in the 30-day public-news crawl.`
          : `No ${label} reports for ${subject} were found in the 30-day window.`,
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
  const questions = topics.includes("risk") ? highlights.slice(0, 3).map((highlight, index) => ({
    text: [
      `What has changed since “${highlight.title}” was reported, and what is the latest status?`,
      `What should we understand about the next steps related to “${highlight.title}”?`,
      `How does “${highlight.title}” affect the priorities for this conversation?`,
    ][index]!,
    sourceIds: highlight.sourceIds,
  })) : [];

  if (topics.includes("risk") && context && !questions.some((question) => question.text.includes(context))) {
    questions.push({
      text: `How does the meeting context (“${context}”) connect to these recent developments?`,
      sourceIds: highlights.slice(0, 2).flatMap((highlight) => highlight.sourceIds),
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
  const input = CreateBriefingBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({
      error: "Enter a company or person, choose a person role when needed, select a source mode and at least one topic, and set a meeting time.",
    });
    return;
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
      windowStart,
      windowEnd,
      input.data.context?.trim() || undefined,
      publicRoleTitle,
      companyName,
    );
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
      ...content,
      sources,
    });
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Tavily is not configured.")) {
      req.log.warn("Tavily source search is not configured");
      res.status(503).json({
        error: "Tavily is not connected. Add TAVILY_API_KEY in Replit Secrets, then restart the API Server workflow.",
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
  }
});

export default router;
