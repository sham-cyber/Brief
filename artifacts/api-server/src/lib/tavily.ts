import { randomUUID } from "node:crypto";
import {
  emitFraudGuardEvent as defaultFraudGuardEmitter,
  type FraudGuardEventEmitter,
  type FraudGuardEventInput,
} from "./fraudguard-events.ts";

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

export type TavilyFraudGuardContext = {
  userId: string;
  emitter?: FraudGuardEventEmitter;
};

export class TavilySearchError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Tavily search failed with status ${status}.`);
    this.status = status;
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
  fraudGuard?: TavilyFraudGuardContext,
  fetcher: typeof fetch = fetch,
): Promise<{ results: TavilyResult[]; creditsUsed: number | null }> {
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(25_000)])
    : AbortSignal.timeout(25_000);
  const includeImages = options.includeImages ?? true;
  const dateFilter = options.dateFilter ?? true;
  const attemptId = randomUUID();
  const startedAt = Date.now();
  const emit = fraudGuard?.emitter ?? defaultFraudGuardEmitter;
  const emitSafe = (event: FraudGuardEventInput) => {
    if (!fraudGuard?.userId) return;
    try {
      emit(event);
    } catch {
      // Optional telemetry must not affect Tavily search results.
    }
  };
  const eventBase = {
    userId: fraudGuard?.userId ?? "",
    attemptId,
    operation: "tavily_search" as const,
    provider: "tavily",
  };
  let validationOutcome: "passed" | "failed" | "not_run" = "not_run";
  if (fraudGuard?.userId) {
    emitSafe({
      ...eventBase,
      eventType: "start",
      status: "started",
    });
  }

  try {
    const response = await fetcher("https://api.tavily.com/search", {
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
      validationOutcome = "failed";
      throw new TavilySearchError(502);
    }

    validationOutcome = "passed";
    const results = payload.results as TavilyResult[];
    const durationMs = Date.now() - startedAt;
    emitSafe({
      ...eventBase,
      eventType: "completion",
      status: "completed",
      durationMs,
      resultCount: results.length,
    });
    emitSafe({
      ...eventBase,
      eventType: "citation_guardrail",
      status: "passed",
      validationOutcome,
    });

    const reportedCredits = payload.usage?.credits;
    return {
      results,
      creditsUsed:
        typeof reportedCredits === "number" &&
        Number.isFinite(reportedCredits) &&
        reportedCredits >= 0
          ? reportedCredits
          : null,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const cancelled = Boolean(signal?.aborted);
    emitSafe({
      ...eventBase,
      eventType: cancelled ? "cancellation" : "failure",
      status: cancelled ? "cancelled" : "failed",
      durationMs,
    });
    emitSafe({
      ...eventBase,
      eventType: "citation_guardrail",
      status: validationOutcome,
      validationOutcome,
    });
    throw error;
  }
}
