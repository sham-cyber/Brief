import { pool } from "@workspace/db";

export const TAVILY_REQUEST_LIMIT = 5;
export const TAVILY_REQUEST_WINDOW_MS = 5 * 60_000;

type RequestUsageRow = {
  request_count: number | string;
  requested_at: Date | string;
};

export type TavilyRequestRateLimitResult = {
  allowed: boolean;
  used: number;
  remaining: number;
  retryAfterSeconds: number;
};

function toTimestamp(value: Date | string): number | null {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

/**
 * Atomically reserve all Tavily calls for a crawl before any external request
 * starts. Rejected crawls therefore cannot partially exceed the shared cap.
 */
export async function reserveTavilyRequestSlots(
  requestCount: number,
): Promise<TavilyRequestRateLimitResult> {
  if (!Number.isSafeInteger(requestCount) || requestCount < 1) {
    throw new Error("Tavily request reservations must be a positive integer.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      ["briefing-agent-tavily-request-rate-limit"],
    );
    await client.query(
      `DELETE FROM briefing_tavily_request_usage
       WHERE requested_at < NOW() - INTERVAL '5 minutes'`,
    );

    const result = await client.query<RequestUsageRow>(
      `SELECT request_count, requested_at
       FROM briefing_tavily_request_usage
       WHERE requested_at >= NOW() - INTERVAL '5 minutes'
       ORDER BY requested_at ASC`,
    );
    const used = result.rows.reduce(
      (total, row) => total + Math.max(0, Number(row.request_count)),
      0,
    );

    if (
      requestCount > TAVILY_REQUEST_LIMIT ||
      used + requestCount > TAVILY_REQUEST_LIMIT
    ) {
      let requestsUntilReset = Math.max(
        1,
        used + requestCount - TAVILY_REQUEST_LIMIT,
      );
      let retryAt = Date.now() + TAVILY_REQUEST_WINDOW_MS;
      for (const row of result.rows) {
        requestsUntilReset -= Math.max(0, Number(row.request_count));
        if (requestsUntilReset <= 0) {
          const requestedAt = toTimestamp(row.requested_at);
          if (requestedAt !== null) {
            retryAt = requestedAt + TAVILY_REQUEST_WINDOW_MS;
          }
          break;
        }
      }
      await client.query("COMMIT");
      return {
        allowed: false,
        used,
        remaining: Math.max(0, TAVILY_REQUEST_LIMIT - used),
        retryAfterSeconds: Math.max(1, Math.ceil((retryAt - Date.now()) / 1000)),
      };
    }

    await client.query(
      `INSERT INTO briefing_tavily_request_usage (request_count)
       VALUES ($1)`,
      [requestCount],
    );
    await client.query("COMMIT");
    return {
      allowed: true,
      used: used + requestCount,
      remaining: TAVILY_REQUEST_LIMIT - used - requestCount,
      retryAfterSeconds: 0,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
