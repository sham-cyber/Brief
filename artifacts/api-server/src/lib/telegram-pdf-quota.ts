// Copyright 2026 Sham Mohite
// Author: Sham Mohite
// SPDX-License-Identifier: Apache-2.0

export const TELEGRAM_PDF_HOURLY_LIMIT = 3;
const WINDOW_MS = 60 * 60_000;

type UsageRow = {
  count: number;
  oldestAt: Date | string | null;
};

export async function getTelegramPdfUsage(userId: string) {
  const { pool } = await import("@workspace/db");
  const result = await pool.query<UsageRow>(
    `SELECT COUNT(*)::int AS count, MIN(created_at) AS "oldestAt"
     FROM telegram_pdf_deliveries
     WHERE user_id = $1
       AND status IN ('reserved', 'sent')
       AND created_at > NOW() - INTERVAL '1 hour'`,
    [userId],
  );
  const row = result.rows[0] ?? { count: 0, oldestAt: null };
  const usedThisHour = Number(row.count);
  const resetAt = row.oldestAt
    ? new Date(new Date(row.oldestAt).getTime() + WINDOW_MS).toISOString()
    : null;
  return {
    limit: TELEGRAM_PDF_HOURLY_LIMIT,
    usedThisHour,
    remaining: Math.max(0, TELEGRAM_PDF_HOURLY_LIMIT - usedThisHour),
    windowResetsAt: resetAt,
  };
}

export async function reserveTelegramPdf(userId: string): Promise<{
  allowed: boolean;
  reservationId: number | null;
  remaining: number;
  windowResetsAt: string | null;
  retryAfterSeconds: number;
}> {
  const { pool } = await import("@workspace/db");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [`briefing-agent:telegram-pdf:${userId}`],
    );
    await client.query(
      `DELETE FROM telegram_pdf_deliveries
       WHERE user_id = $1 AND created_at <= NOW() - INTERVAL '1 hour'`,
      [userId],
    );
    const result = await client.query<UsageRow>(
      `SELECT COUNT(*)::int AS count, MIN(created_at) AS "oldestAt"
       FROM telegram_pdf_deliveries
       WHERE user_id = $1
         AND status IN ('reserved', 'sent')
         AND created_at > NOW() - INTERVAL '1 hour'`,
      [userId],
    );
    const row = result.rows[0] ?? { count: 0, oldestAt: null };
    const used = Number(row.count);
    const resetAt = row.oldestAt
      ? new Date(new Date(row.oldestAt).getTime() + WINDOW_MS).toISOString()
      : null;
    if (used >= TELEGRAM_PDF_HOURLY_LIMIT) {
      await client.query("ROLLBACK");
      return {
        allowed: false,
        reservationId: null,
        remaining: 0,
        windowResetsAt: resetAt,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((new Date(resetAt ?? Date.now() + WINDOW_MS).getTime() - Date.now()) / 1000),
        ),
      };
    }

    const inserted = await client.query<{ id: number }>(
      `INSERT INTO telegram_pdf_deliveries (user_id, status)
       VALUES ($1, 'reserved')
       RETURNING id`,
      [userId],
    );
    await client.query("COMMIT");
    return {
      allowed: true,
      reservationId: inserted.rows[0].id,
      remaining: Math.max(0, TELEGRAM_PDF_HOURLY_LIMIT - used - 1),
      windowResetsAt: resetAt ?? new Date(Date.now() + WINDOW_MS).toISOString(),
      retryAfterSeconds: 0,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function markTelegramPdfSent(reservationId: number): Promise<void> {
  const { pool } = await import("@workspace/db");
  await pool.query(
    `UPDATE telegram_pdf_deliveries
     SET status = 'sent', sent_at = NOW()
     WHERE id = $1`,
    [reservationId],
  );
}

export async function releaseTelegramPdfReservation(
  reservationId: number,
): Promise<void> {
  const { pool } = await import("@workspace/db");
  await pool.query(
    `DELETE FROM telegram_pdf_deliveries
     WHERE id = $1 AND status = 'reserved'`,
    [reservationId],
  );
}

