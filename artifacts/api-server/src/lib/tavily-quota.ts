import { pool } from "@workspace/db";

export const TAVILY_DAILY_LIMIT_MS = 120_000;
export const TAVILY_CRAWL_HARD_STOP_MS = 180_000;

type UsageTotalsRow = {
  used_ms: string | number;
  active_count: string | number;
  reset_at: Date | string | null;
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
  userId: string,
): Promise<TavilyQuotaStatus> {
  const result = await executor.query<UsageTotalsRow>(
    `SELECT
       COALESCE(SUM(reserved_ms), 0)::int AS used_ms,
       COUNT(*) FILTER (WHERE finished_at IS NULL)::int AS active_count,
       MIN(started_at + INTERVAL '24 hours')
         FILTER (WHERE reserved_ms > 0) AS reset_at
     FROM briefing_tavily_usage
     WHERE user_id = $1
       AND started_at >= NOW() - INTERVAL '24 hours'`,
    [userId],
  );
  const usedMs = Math.min(
    TAVILY_DAILY_LIMIT_MS,
    Math.max(0, Number(result.rows[0]?.used_ms ?? 0)),
  );

  return {
    limitMs: TAVILY_DAILY_LIMIT_MS,
    usedMs,
    remainingMs: Math.max(0, TAVILY_DAILY_LIMIT_MS - usedMs),
    resetsAt: toDate(result.rows[0]?.reset_at),
    active: Number(result.rows[0]?.active_count ?? 0) > 0,
  };
}

export async function getTavilyQuotaStatus(
  userId: string,
): Promise<TavilyQuotaStatus> {
  return readUsageTotals(pool, userId);
}

export async function reserveTavilyQuota(
  userId: string,
): Promise<TavilyQuotaReservation> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [userId],
    );

    await client.query(
      `DELETE FROM briefing_tavily_usage
       WHERE user_id = $1
         AND started_at < NOW() - INTERVAL '24 hours'`,
      [userId],
    );

    const quota = await readUsageTotals(client, userId);
    if (quota.remainingMs <= 0) {
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
