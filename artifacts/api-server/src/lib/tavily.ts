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

export class TavilySearchError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Tavily search failed with status ${status}.`);
    this.name = "TavilySearchError";
    this.status = status;
  }
}

export type TavilySearchOptions = {
  signal?: AbortSignal;
  includeDomains?: readonly string[];
};

export async function searchTavily(
  query: string,
  startDate: string,
  endDate: string,
  apiKey: string,
  options: TavilySearchOptions = {},
): Promise<{ results: TavilyResult[]; creditsUsed: number | null }> {
  const requestSignal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(25_000)])
    : AbortSignal.timeout(25_000);
  const includeDomains = [...new Set(options.includeDomains ?? [])];
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      topic: "news",
      max_results: 8,
      start_date: startDate,
      end_date: endDate,
      include_published_date: true,
      filter_by_published_date: true,
      include_answer: false,
      include_raw_content: false,
      include_images: true,
      include_image_descriptions: true,
      include_usage: true,
      language: "en",
      include_domains: includeDomains,
      include_domains_mode: "restrict",
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
