import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { CreateBriefingBody, CreateBriefingResponse } from "@workspace/api-zod";

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

const ROLE_SEARCH_TERMS: Record<PersonRole, string> = {
  business_owner: "(business owner OR founder OR chairman OR entrepreneur OR CEO)",
  mp: "(Member of Parliament OR MP OR legislator OR constituency OR parliament)",
  corporate: "(corporate executive OR CEO OR director OR executive leadership)",
};

function decodeXml(value: string): string {
  const decoded = value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([\da-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    );
  return decoded
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1] ? decodeXml(match[1]) : "";
}

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

async function searchNews(
  subject: string,
  subjectType: "company" | "person",
  personRole: PersonRole | null,
  topics: BriefingTopic[],
  start: Date,
  end: Date,
  context?: string,
): Promise<SearchResult[]> {
  const startDate = start.toISOString().slice(0, 10);
  const endDate = new Date(end.getTime() + 86_400_000).toISOString().slice(0, 10);
  const roleTerms = subjectType === "person" && personRole
    ? ` ${ROLE_SEARCH_TERMS[personRole]}`
    : "";
  const searchTerms: { topic: BriefingTopic; term: string }[] = topics.map((topic) => {
    const terms: Record<BriefingTopic, string> = {
      news: `${subject}${roleTerms} news`,
      hire: subjectType === "person"
        ? `${subject}${roleTerms} (appointed OR appointment OR joins OR joined OR hired OR hiring OR promoted OR promotion)`
        : `${subject} (appointed OR appointment OR joins OR joined OR hired OR hiring OR promoted OR promotion OR named CEO)`,
      launch: `${subject}${roleTerms} (launch OR launched OR launches OR release OR released OR unveiled OR debut OR introduced)`,
      financial: subjectType === "company"
        ? `${subject} (share price OR shares OR stock OR earnings OR profit OR loss OR revenue OR valuation OR funding)`
        : `${subject}${roleTerms} (financial results OR earnings OR investment OR profit OR loss OR valuation OR funding)`,
      risk: `${subject}${roleTerms} (risk OR lawsuit OR sues OR sued OR recall OR investigation OR regulator OR fine OR penalty OR restructuring OR breach)`,
    };
    return { topic, term: terms[topic] };
  });
  const feeds = await Promise.all(
    searchTerms.map(async ({ topic, term }) => {
      const url = new URL("https://news.google.com/rss/search");
      url.searchParams.set("q", `${term} after:${startDate} before:${endDate}`);
      url.searchParams.set("hl", "en-US");
      url.searchParams.set("gl", "US");
      url.searchParams.set("ceid", "US:en");

      const response = await fetch(url, {
        headers: { "User-Agent": "BriefingAgent/1.0 (+https://replit.com)" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        throw new Error(`News search returned ${response.status}`);
      }
      return { topic, xml: await response.text() };
    }),
  );

  const uniqueItems = new Map<string, { item: Omit<NewsItem, "id">; searchedAs: BriefingTopic }>();
  for (const { topic, xml } of feeds) {
    const entries = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 12);
    for (const entry of entries) {
      const item = entry[1] ?? "";
      const title = readTag(item, "title");
      const link = readTag(item, "link");
      const source = readTag(item, "source");
      const published = readTag(item, "pubDate");
      const description = readTag(item, "description");
      const parsedDate = published ? new Date(published) : null;
      const validDate =
        parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;
      if (!title || !link || !validDate || uniqueItems.has(link)) continue;

      let publisher = source;
      try {
        const parsedUrl = new URL(link);
        if (parsedUrl.protocol !== "https:") continue;
        publisher ||= parsedUrl.hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      if (validDate.getTime() < start.getTime() || validDate.getTime() > end.getTime()) {
        continue;
      }

      uniqueItems.set(link, {
        item: {
          title,
          url: link,
          publisher,
          publishedAt: validDate?.toISOString() ?? null,
          snippet: description.slice(0, 700),
        },
        searchedAs: topic,
      });
    }
  }

  const contextKeywords = getContextTerms(context);
  return [...uniqueItems.values()]
    .map((entry) => ({
      ...entry,
      contextScore: contextRelevanceScore(
        { ...entry.item, id: "", snippet: entry.item.snippet },
        contextKeywords,
      ),
    }))
    .filter(({ item, searchedAs }) =>
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

function buildBriefingContent(
  subject: string,
  subjectType: "company" | "person",
  context: string | undefined,
  topics: BriefingTopic[],
  sources: SearchResult[],
): {
  overview: { text: string; sourceIds: string[] };
  highlights: {
    category: BriefingTopic;
    title: string;
    summary: string;
    sourceIds: string[];
  }[];
  questions: { text: string; sourceIds: string[] }[];
} {
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
  const latest = sources.reduce((newest, candidate) =>
    new Date(candidate.source.publishedAt ?? 0).getTime() >
    new Date(newest.source.publishedAt ?? 0).getTime()
      ? candidate
      : newest,
  ).source;
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
      text: `Recent public coverage for this ${subjectType} includes ${sources.length} reports from the 30-day research window. The latest report is “${latest.title},” published by ${latest.publisher}.`,
      sourceIds: [latest.id],
    },
    highlights,
    questions,
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
    const collected = await searchNews(
      input.data.subject.trim(),
      input.data.subjectType,
      input.data.personRole,
      topics,
      windowStart,
      windowEnd,
      input.data.context?.trim() || undefined,
    );

    if (collected.length === 0) {
      res.status(502).json({
        error: "No recent articles were found. Try a more specific company or person name.",
      });
      return;
    }

    const relevant = collected.filter(({ source, searchedAs }) =>
      classifySource(source, searchedAs, topics) !== null,
    );
    if (relevant.length === 0) {
      res.status(502).json({
        error: "No clearly matching public reports were found for the selected topics in the last 30 days.",
      });
      return;
    }

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
      sourceMode: "public",
      topics,
      meetingAt: meetingAt.toISOString(),
      generatedAt: now.toISOString(),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      ...content,
      sources,
    });
    res.json(result);
  } catch {
    req.log.error({ sourceMode: input.data.sourceMode }, "Briefing generation failed");
    res.status(502).json({
      error: "The briefing could not be generated. Please try again shortly.",
    });
  }
});

export default router;
