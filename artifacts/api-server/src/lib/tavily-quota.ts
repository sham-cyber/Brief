import { pool } from "@workspace/db";

export const TAVILY_DAILY_LIMIT_MS = 120_000;
export const TAVILY_CRAWL_HARD_STOP_MS = 180_000;

type UsageRow = {
  reserved_ms: string | number;
  started_at: Date | string;
  finished_at: Date | string | null;
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
): Promise<TavilyQuotaStatus> {
  const result = await executor.query<UsageRow>(
    `SELECT reserved_ms, started_at, finished_at
     FROM briefing_tavily_usage
     WHERE started_at >= NOW() - INTERVAL '24 hours'
     ORDER BY started_at ASC`,
  );
  const totalUsedMs = result.rows.reduce(
    (total, row) => total + Math.max(0, Number(row.reserved_ms)),
    0,
  );
  const usedMs = Math.min(
    TAVILY_DAILY_LIMIT_MS,
    Math.max(0, totalUsedMs),
  );
  const active = result.rows.some((row) => row.finished_at === null);
  let resetsAt: Date | null = null;
  if (totalUsedMs >= TAVILY_DAILY_LIMIT_MS) {
    let usageToExpire = totalUsedMs - TAVILY_DAILY_LIMIT_MS + 1;
    for (const row of result.rows) {
      usageToExpire -= Math.max(0, Number(row.reserved_ms));
      if (usageToExpire <= 0) {
        const startedAt = toDate(row.started_at);
        if (startedAt) {
          resetsAt = new Date(startedAt.getTime() + 24 * 60 * 60 * 1000);
        }
        break;
      }
    }
  }

  return {
    limitMs: TAVILY_DAILY_LIMIT_MS,
    usedMs,
    remainingMs: Math.max(0, TAVILY_DAILY_LIMIT_MS - usedMs),
    resetsAt,
    active,
  };
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

    await client.query(
      `DELETE FROM briefing_tavily_usage
       WHERE started_at < NOW() - INTERVAL '24 hours'`,
    );

    const quota = await readUsageTotals(client);
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
