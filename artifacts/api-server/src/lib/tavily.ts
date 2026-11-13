export type TavilyResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  published_date?: unknown;
  images?: unknown;
};

export type TavilySearchResponse = {
  results?: unknown;
  usage?: { credits?: unknown } | null;
};

export type TavilySearchOptions = {
  topic?: "news" | "general";
  dateFilter?: boolean;
  excludeDomains?: string[];
  includeImages?: boolean;
};

export class TavilySearchError extends Error {
  constructor(readonly status: number) {
    super(`Tavily search failed with status ${status}.`);
    this.name = "TavilySearchError";
  }
}

export async function searchTavily(
  query: string,
  startDate: string,
  endDate: string,
  apiKey: string,
  signal?: AbortSignal,
  options: TavilySearchOptions = {},
): Promise<{ results: TavilyResult[]; creditsUsed: number | null }> {
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(25_000)])
    : AbortSignal.timeout(25_000);
  const includeImages = options.includeImages ?? true;
  const dateFilter = options.dateFilter ?? true;
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      topic: options.topic ?? "news",
      max_results: 8,
      ...(dateFilter
        ? {
            start_date: startDate,
            end_date: endDate,
            include_published_date: true,
            filter_by_published_date: true,
          }
        : {}),
      include_answer: false,
      include_raw_content: false,
      include_images: includeImages,
      include_image_descriptions: includeImages,
      include_usage: true,
      language: "en",
      ...(options.excludeDomains?.length
        ? { exclude_domains: options.excludeDomains }
        : {}),
    }),
    signal: requestSignal,
  });

  if (!response.ok) throw new TavilySearchError(response.status);

  const payload = await response.json() as TavilySearchResponse;
  if (!Array.isArray(payload.results)) {
    throw new TavilySearchError(502);
  }

  const reportedCredits = payload.usage?.credits;
  return {
    results: payload.results as TavilyResult[],
    creditsUsed:
      typeof reportedCredits === "number" &&
      Number.isFinite(reportedCredits) &&
      reportedCredits >= 0
        ? reportedCredits
        : null,
  };
}
