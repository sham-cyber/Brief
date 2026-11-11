import { pool } from "@workspace/db";
import { verifyPinHash } from "./briefing-pin-crypto.ts";

export type StartPinCheck =
  | { valid: true }
  | {
      valid: false;
      status: 403 | 429 | 503;
      message: string;
      retryAfterSeconds?: number;
    };

export async function isBriefingPinConfigured(userId: string): Promise<boolean> {
  const result = await pool.query(
    "SELECT 1 FROM user_ai_guardrails WHERE user_id = $1",
    [userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function verifyBriefingStartPin(
  userId: string,
  suppliedValue: string,
): Promise<StartPinCheck> {
  const result = await pool.query<{
    passcode_salt: string;
    passcode_hash: string;
    failed_attempts: number;
    locked_until: Date | null;
  }>(
    `SELECT passcode_salt, passcode_hash, failed_attempts, locked_until
     FROM user_ai_guardrails
     WHERE user_id = $1`,
    [userId],
  );
  const record = result.rows[0];
  if (!record) {
    return {
      valid: false,
      status: 503,
      message: "Set your four-digit briefing PIN in AI controls before starting.",
    };
  }

  if (record.locked_until && new Date(record.locked_until).getTime() > Date.now()) {
    return {
      valid: false,
      status: 429,
      message: "Too many incorrect PIN attempts. Try again after the lockout period.",
      retryAfterSeconds: Math.ceil((new Date(record.locked_until).getTime() - Date.now()) / 1000),
    };
  }

  const valid = await verifyPinHash(
    suppliedValue,
    record.passcode_salt,
    record.passcode_hash,
  );
  if (!valid) {
    const updated = await pool.query<{ failed_attempts: number }>(
      `UPDATE user_ai_guardrails
       SET failed_attempts = failed_attempts + 1,
           locked_until = CASE
             WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes'
             ELSE locked_until
           END,
           is_activated = false,
           updated_at = NOW()
       WHERE user_id = $1
       RETURNING failed_attempts`,
      [userId],
    );
    if ((updated.rows[0]?.failed_attempts ?? 0) >= 5) {
      return {
        valid: false,
        status: 429,
        message: "Too many incorrect PIN attempts. Try again after the lockout period.",
        retryAfterSeconds: 15 * 60,
      };
    }
    return { valid: false, status: 403, message: "The briefing PIN is incorrect." };
  }

  await pool.query(
    "UPDATE user_ai_guardrails SET failed_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE user_id = $1",
    [userId],
  );
  return { valid: true };
}
