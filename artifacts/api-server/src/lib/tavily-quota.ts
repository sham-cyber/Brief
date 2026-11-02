import { pool } from "@workspace/db";

export const TAVILY_DAILY_LIMIT_MS = 120_000;
export const TAVILY_CRAWL_HARD_STOP_MS = 180_000;
export const TAVILY_QUOTA_TIME_ZONE = "Asia/Kolkata";
const STALE_RESERVATION_GRACE_MS = TAVILY_CRAWL_HARD_STOP_MS + 30_000;

type UsageRow = {
  reserved_ms: string | number;
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
  allowed: boolean;
  reservationId: number | null;
  reason: "active-crawl" | "daily-limit" | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function readUsageTotals(
  executor: Pick<typeof pool, "query">,
  dayBounds?: CalendarDayBounds,
): Promise<TavilyQuotaStatus> {
  const bounds = dayBounds ?? await getCalendarDayBounds(executor);
  const result = await executor.query<UsageRow>(
    `SELECT reserved_ms
     FROM briefing_tavily_usage
     WHERE started_at >= $1
       AND started_at < $2
     ORDER BY started_at ASC`,
    [bounds.dayStart, bounds.nextDayStart],
  );
  const activeResult = await executor.query<{ active: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM briefing_tavily_usage
       WHERE finished_at IS NULL
         AND started_at >= NOW() - ($1::double precision * INTERVAL '1 millisecond')
     ) AS active`,
    [STALE_RESERVATION_GRACE_MS],
  );
  const totalUsedMs = result.rows.reduce(
    (total, row) => total + Math.max(0, Number(row.reserved_ms)),
    0,
  );
  const usedMs = Math.min(
    TAVILY_DAILY_LIMIT_MS,
    Math.max(0, totalUsedMs),
  );
  const active = activeResult.rows[0]?.active ?? false;
  const resetsAt =
    totalUsedMs >= TAVILY_DAILY_LIMIT_MS ? bounds.nextDayStart : null;

  return {
    limitMs: TAVILY_DAILY_LIMIT_MS,
    usedMs,
    remainingMs: Math.max(0, TAVILY_DAILY_LIMIT_MS - usedMs),
    resetsAt,
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

export async function getTavilyQuotaStatus(): Promise<TavilyQuotaStatus> {
  return readUsageTotals(pool);
}

export async function reserveTavilyQuota(
  userId: string,
): Promise<TavilyQuotaReservation> {
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

    const quota = await readUsageTotals(client, dayBounds);
    if (quota.active || quota.remainingMs <= 0) {
      await client.query("COMMIT");
      return {
        ...quota,
        allowed: false,
        reservationId: null,
        reason: quota.active ? "active-crawl" : "daily-limit",
      };
    }

    const inserted = await client.query<{ id: number }>(
      `INSERT INTO briefing_tavily_usage (user_id, reserved_ms)
       VALUES ($1, $2)
       RETURNING id`,
      [userId, quota.remainingMs],
    );
    await client.query("COMMIT");

    return {
      ...quota,
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
