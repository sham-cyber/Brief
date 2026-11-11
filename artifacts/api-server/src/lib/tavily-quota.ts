import { pool } from "@workspace/db";

export const TAVILY_DAILY_LIMIT_MS = 120_000;
export const TAVILY_DAILY_CRAWL_START_LIMIT = 10;
export const TAVILY_DAILY_CRAWL_START_DEFAULT = 10;
export const TAVILY_MAX_SEARCHES_PER_BRIEFING = 5;
export const TAVILY_DAILY_SEARCH_REQUEST_LIMIT =
  TAVILY_DAILY_CRAWL_START_LIMIT * TAVILY_MAX_SEARCHES_PER_BRIEFING;
export const TAVILY_CRAWL_HARD_STOP_MS = 180_000;
export const TAVILY_QUOTA_TIME_ZONE = "Asia/Kolkata";
const STALE_RESERVATION_GRACE_MS = TAVILY_CRAWL_HARD_STOP_MS + 30_000;

type DailyUsageRow = {
  crawl_starts: string | number;
  search_requests: string | number;
};

type UserEventLimitRow = {
  daily_event_limit: string | number;
};

type CalendarDayRow = {
  day_start: Date | string;
  next_day_start: Date | string;
};

type CalendarDayBounds = {
  dayStart: Date;
  nextDayStart: Date;
};

export type TavilyQuotaStatus = {
  limitMs: number;
  usedMs: number;
  remainingMs: number;
  resetsAt: Date | null;
  active: boolean;
};

export type TavilyQuotaReservation = TavilyQuotaStatus & {
  dailyCrawlStartsLimit: number;
  dailyCrawlStartsUsed: number;
  dailyCrawlStartsRemaining: number;
  dailySearchRequestsLimit: number;
  dailySearchRequestsUsed: number;
  dailySearchRequestsRemaining: number;
  allowed: boolean;
  reservationId: number | null;
  reason:
    | "active-crawl"
    | "daily-start-limit"
    | "daily-search-limit"
    | null;
};

export type TavilyDailyUsageStatus = Pick<
  TavilyQuotaReservation,
  | "dailyCrawlStartsLimit"
  | "dailyCrawlStartsUsed"
  | "dailyCrawlStartsRemaining"
  | "dailySearchRequestsLimit"
  | "dailySearchRequestsUsed"
  | "dailySearchRequestsRemaining"
>;

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function readUsageTotals(
  executor: Pick<typeof pool, "query">,
): Promise<TavilyQuotaStatus> {
  const activeResult = await executor.query<{ active: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM briefing_tavily_usage
       WHERE finished_at IS NULL
         AND started_at >= NOW() - ($1::double precision * INTERVAL '1 millisecond')
     ) AS active`,
    [STALE_RESERVATION_GRACE_MS],
  );
  const active = activeResult.rows[0]?.active ?? false;

  return {
    limitMs: TAVILY_DAILY_LIMIT_MS,
    usedMs: 0,
    remainingMs: TAVILY_DAILY_LIMIT_MS,
    resetsAt: null,
    active,
  };
}

async function getCalendarDayBounds(
  executor: Pick<typeof pool, "query">,
): Promise<CalendarDayBounds> {
  const result = await executor.query<CalendarDayRow>(
    `SELECT
       (date_trunc('day', NOW() AT TIME ZONE $1::text) AT TIME ZONE $1::text) AS day_start,
       ((date_trunc('day', NOW() AT TIME ZONE $1::text) + INTERVAL '1 day') AT TIME ZONE $1::text) AS next_day_start`,
    [TAVILY_QUOTA_TIME_ZONE],
  );
  const row = result.rows[0];
  const dayStart = toDate(row?.day_start);
  const nextDayStart = toDate(row?.next_day_start);
  if (!dayStart || !nextDayStart) {
    throw new Error("Could not determine the current Tavily quota calendar day.");
  }
  return { dayStart, nextDayStart };
}

async function readDailyUsage(
  executor: Pick<typeof pool, "query">,
  userId: string,
  dayBounds: CalendarDayBounds,
): Promise<TavilyDailyUsageStatus> {
  const preference = await executor.query<UserEventLimitRow>(
    `SELECT daily_event_limit
     FROM user_briefing_preferences
     WHERE user_id = $1`,
    [userId],
  );
  const configuredLimit = Number(
    preference.rows[0]?.daily_event_limit ?? TAVILY_DAILY_CRAWL_START_DEFAULT,
  );
  const dailyCrawlStartsLimit = Number.isSafeInteger(configuredLimit) &&
    configuredLimit >= 1 &&
    configuredLimit <= TAVILY_DAILY_CRAWL_START_LIMIT
    ? configuredLimit
    : TAVILY_DAILY_CRAWL_START_DEFAULT;
  const dailySearchRequestsLimit =
    dailyCrawlStartsLimit * TAVILY_MAX_SEARCHES_PER_BRIEFING;
  const result = await executor.query<DailyUsageRow>(
    `SELECT
       (COUNT(*) FILTER (WHERE search_count > 0))::integer AS crawl_starts,
       (
         COALESCE(SUM(search_count), 0) +
         (COUNT(*) FILTER (WHERE search_count = 0 AND reserved_ms > 0) * $4::integer)
       )::integer AS search_requests
     FROM briefing_tavily_usage
     WHERE user_id = $1
       AND started_at >= $2
       AND started_at < $3`,
    [
      userId,
      dayBounds.dayStart,
      dayBounds.nextDayStart,
      TAVILY_MAX_SEARCHES_PER_BRIEFING,
    ],
  );
  const crawlStartsUsed = Math.max(0, Number(result.rows[0]?.crawl_starts ?? 0));
  const searchRequestsUsed = Math.max(0, Number(result.rows[0]?.search_requests ?? 0));
  return {
    dailyCrawlStartsLimit,
    dailyCrawlStartsUsed: crawlStartsUsed,
    dailyCrawlStartsRemaining: Math.max(
      0,
      dailyCrawlStartsLimit - crawlStartsUsed,
    ),
    dailySearchRequestsLimit,
    dailySearchRequestsUsed: searchRequestsUsed,
    dailySearchRequestsRemaining: Math.max(
      0,
      dailySearchRequestsLimit - searchRequestsUsed,
    ),
  };
}

export async function saveDailyBriefingEventLimit(
  userId: string,
  dailyEventLimit: number,
): Promise<void> {
  if (
    !Number.isSafeInteger(dailyEventLimit) ||
    dailyEventLimit < 1 ||
    dailyEventLimit > TAVILY_DAILY_CRAWL_START_LIMIT
  ) {
    throw new Error("Choose between 1 and 10 briefing events per day.");
  }
  await pool.query(
    `INSERT INTO user_briefing_preferences (user_id, daily_event_limit, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE
     SET daily_event_limit = EXCLUDED.daily_event_limit,
         updated_at = NOW()`,
    [userId, dailyEventLimit],
  );
}

export async function getTavilyDailyUsageStatus(
  userId: string,
): Promise<TavilyDailyUsageStatus> {
  const dayBounds = await getCalendarDayBounds(pool);
  return readDailyUsage(pool, userId, dayBounds);
}

export async function getTavilyQuotaStatus(): Promise<TavilyQuotaStatus> {
  return readUsageTotals(pool);
}

export async function reserveTavilyQuota(
  userId: string,
  searchRequestCount: number,
): Promise<TavilyQuotaReservation> {
  if (!Number.isSafeInteger(searchRequestCount) || searchRequestCount < 1) {
    throw new Error("Tavily crawl reservations require at least one search request.");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      ["briefing-agent-shared-tavily-pool"],
    );

    const dayBounds = await getCalendarDayBounds(client);
    await client.query(
      `UPDATE briefing_tavily_usage
       SET duration_ms = reserved_ms,
           finished_at = NOW()
       WHERE finished_at IS NULL
         AND started_at < NOW() - ($1::double precision * INTERVAL '1 millisecond')`,
      [STALE_RESERVATION_GRACE_MS],
    );
    await client.query(
      `DELETE FROM briefing_tavily_usage
       WHERE started_at < $1
         AND finished_at IS NOT NULL`,
      [dayBounds.dayStart],
    );

    const quota = await readUsageTotals(client);
    const dailyUsage = await readDailyUsage(client, userId, dayBounds);
    const reason = quota.active
      ? "active-crawl"
      : dailyUsage.dailyCrawlStartsRemaining <= 0
        ? "daily-start-limit"
        : dailyUsage.dailySearchRequestsRemaining < searchRequestCount
          ? "daily-search-limit"
          : null;
    if (reason) {
      await client.query("COMMIT");
      return {
        ...quota,
        ...dailyUsage,
        allowed: false,
        reservationId: null,
        reason,
      };
    }

    const inserted = await client.query<{ id: number }>(
      `INSERT INTO briefing_tavily_usage (user_id, reserved_ms, search_count)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [userId, TAVILY_DAILY_LIMIT_MS, searchRequestCount],
    );
    await client.query("COMMIT");

    return {
      ...quota,
      ...dailyUsage,
      dailyCrawlStartsUsed: dailyUsage.dailyCrawlStartsUsed + 1,
      dailyCrawlStartsRemaining: Math.max(
        0,
        dailyUsage.dailyCrawlStartsRemaining - 1,
      ),
      dailySearchRequestsUsed:
        dailyUsage.dailySearchRequestsUsed + searchRequestCount,
      dailySearchRequestsRemaining: Math.max(
        0,
        dailyUsage.dailySearchRequestsRemaining - searchRequestCount,
      ),
      allowed: true,
      reservationId: inserted.rows[0]?.id ?? null,
      reason: null,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelTavilyQuotaReservation(
  userId: string,
  reservationId: number,
): Promise<void> {
  await pool.query(
    `DELETE FROM briefing_tavily_usage
     WHERE id = $1
       AND user_id = $2
       AND finished_at IS NULL`,
    [reservationId, userId],
  );
}

export async function finishTavilyQuotaReservation(
  userId: string,
  reservationId: number,
  durationMs: number,
): Promise<void> {
  const boundedDuration = Math.max(
    0,
    Math.min(TAVILY_DAILY_LIMIT_MS, Math.floor(durationMs)),
  );
  await pool.query(
    `UPDATE briefing_tavily_usage
     SET duration_ms = $3,
         reserved_ms = $3,
         finished_at = NOW()
     WHERE id = $1
       AND user_id = $2
       AND finished_at IS NULL`,
    [reservationId, userId, boundedDuration],
  );
}
