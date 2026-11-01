import { Router, type IRouter } from "express";
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

async function searchNews(
  subject: string,
  start: Date,
  end: Date,
): Promise<NewsItem[]> {
  const startDate = start.toISOString().slice(0, 10);
  const endDate = new Date(end.getTime() + 86_400_000).toISOString().slice(0, 10);
  const searchTerms = [
    subject,
    `${subject} (CEO OR leadership OR appointed OR joins OR hire)`,
    `${subject} (launch OR launches OR product OR release)`,
  ];
  const feeds = await Promise.all(
    searchTerms.map(async (term) => {
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
      return response.text();
    }),
  );

  const uniqueItems = new Map<string, Omit<NewsItem, "id">>();
  for (const xml of feeds) {
    const entries = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 8);
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
      if (!title || !link || uniqueItems.has(link)) continue;

      let publisher = source;
      try {
        const parsedUrl = new URL(link);
        if (parsedUrl.protocol !== "https:") continue;
        publisher ||= parsedUrl.hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      if (
        validDate &&
        (validDate.getTime() < start.getTime() || validDate.getTime() > end.getTime())
      ) {
        continue;
      }

      uniqueItems.set(link, {
        title,
        url: link,
        publisher,
        publishedAt: validDate?.toISOString() ?? null,
        snippet: description.slice(0, 700),
      });
    }
  }

  return [...uniqueItems.values()]
    .sort(
      (a, b) =>
        new Date(b.publishedAt ?? 0).getTime() -
        new Date(a.publishedAt ?? 0).getTime(),
    )
    .slice(0, 18)
    .map((item, index) => ({ ...item, id: `S${index + 1}` }));
}

function classifySource(source: NewsItem): "news" | "hire" | "launch" {
  const text = `${source.title} ${source.snippet}`;
  if (
    /\b(?:appointed|appointment|joins?|joined|hired|hire|hiring|named\s+(?:as|to)|new\s+(?:CEO|CFO|CTO|chief executive|president|chair|director)|promoted|promotion)\b/i.test(
      text,
    )
  ) {
    return "hire";
  }
  if (
    /\b(?:launch(?:es|ed)?|releas(?:e|es|ed)|introduc(?:e|es|ed|ing)|unveil(?:s|ed)?|roll(?:s)? out|debut(?:s|ed)?)\b/i.test(
      text,
    )
  ) {
    return "launch";
  }
  return "news";
}

function buildBriefingContent(
  subject: string,
  context: string | undefined,
  sources: NewsItem[],
): {
  overview: { text: string; sourceIds: string[] };
  highlights: {
    category: "news" | "hire" | "launch";
    title: string;
    summary: string;
    sourceIds: string[];
  }[];
  questions: { text: string; sourceIds: string[] }[];
} {
  const highlights = sources.slice(0, 6).map((source) => ({
    category: classifySource(source),
    title: source.title,
    summary:
      source.snippet ||
      `This report was published by ${source.publisher}${source.publishedAt ? ` on ${new Date(source.publishedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}` : ""}.`,
    sourceIds: [source.id],
  }));
  const latest = sources[0]!;
  const questions = highlights.slice(0, 3).map((highlight, index) => ({
    text: [
      `What has changed since “${highlight.title}” was reported, and what is the latest status?`,
      `What should we understand about the next steps related to “${highlight.title}”?`,
      `How does “${highlight.title}” affect the priorities for this conversation?`,
    ][index]!,
    sourceIds: highlight.sourceIds,
  }));

  if (context) {
    questions.push({
      text: `How does the meeting context (“${context}”) connect to these recent developments?`,
      sourceIds: highlights.slice(0, 2).flatMap((highlight) => highlight.sourceIds),
    });
  }

  return {
    overview: {
      text: `Recent coverage of ${subject} includes ${sources.length} reports from the 30-day research window. The latest report is “${latest.title},” published by ${latest.publisher}.`,
      sourceIds: [latest.id],
    },
    highlights,
    questions,
  };
}

router.post("/briefings", async (req, res): Promise<void> => {
  const input = CreateBriefingBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Enter a subject and a valid meeting date." });
    return;
  }

  try {
    const now = new Date();
    const meetingAt = input.data.meetingAt;
    const windowEnd = meetingAt < now ? meetingAt : now;
    const windowStart = new Date(windowEnd.getTime() - 30 * 86_400_000);
    const sources = await searchNews(input.data.subject.trim(), windowStart, windowEnd);

    if (sources.length === 0) {
      res.status(502).json({
        error: "No recent articles were found. Try a more specific company or person name.",
      });
      return;
    }

    const content = buildBriefingContent(
      input.data.subject.trim(),
      input.data.context?.trim() || undefined,
      sources,
    );

    const result = CreateBriefingResponse.parse({
      subject: input.data.subject.trim(),
      meetingAt: meetingAt.toISOString(),
      generatedAt: now.toISOString(),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      ...content,
      sources,
    });
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Briefing generation failed");
    res.status(502).json({
      error: "The briefing could not be generated. Please try again shortly.",
    });
  }
});

export default router;
