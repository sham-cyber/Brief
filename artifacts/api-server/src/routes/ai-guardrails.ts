import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import { Router, type IRouter } from "express";
import { z } from "zod";

const router: IRouter = Router();
const scryptAsync = promisify(scrypt);
const PASSCODE_MIN_LENGTH = 8;
const PASSCODE_MAX_LENGTH = 128;
const AI_REQUESTS_PER_TAB = 1;
const AI_SPEECH_LIMIT_SECONDS = 120;
const aiRequestTab = z.enum(["news", "hire", "launch", "financial", "risk"]);

const passcodeBody = z.object({
  passcode: z.string().min(PASSCODE_MIN_LENGTH).max(PASSCODE_MAX_LENGTH),
});

const briefingRequestBody = z.object({
  briefingId: z.string().uuid(),
  tab: aiRequestTab,
});

function aiServerEnabled() {
  return process.env.AI_FEATURE_ENABLED === "true";
}

function aiProviderAvailableForUser(_userId: string) {
  // Fail closed until per-user AI-key storage and an AI provider route are added.
  return false;
}

function authenticatedUserId(req: Parameters<typeof getAuth>[0]) {
  return getAuth(req).userId ?? null;
}

async function hashPasscode(passcode: string, salt: string) {
  const derived = (await scryptAsync(passcode, salt, 64)) as Buffer;
  return derived.toString("hex");
}

function validHash(candidate: string, stored: string) {
  const candidateBuffer = Buffer.from(candidate, "hex");
  const storedBuffer = Buffer.from(stored, "hex");
  return (
    candidateBuffer.length === storedBuffer.length &&
    candidateBuffer.length > 0 &&
    timingSafeEqual(candidateBuffer, storedBuffer)
  );
}

router.get("/ai/guardrails", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to view AI access settings." });
    return;
  }

  try {
    const result = await pool.query(
      "SELECT is_activated FROM user_ai_guardrails WHERE user_id = $1",
      [userId],
    );
    res.json({
      serverEnabled: aiServerEnabled(),
      passcodeConfigured: (result.rowCount ?? 0) > 0,
      activated:
        result.rows[0]?.is_activated === true &&
        aiServerEnabled() &&
        aiProviderAvailableForUser(userId),
      requestsPerTab: AI_REQUESTS_PER_TAB,
      speechLimitSeconds: AI_SPEECH_LIMIT_SECONDS,
      aiProviderConnected: aiProviderAvailableForUser(userId),
    });
  } catch {
    res.status(503).json({ error: "AI access settings are unavailable." });
  }
});

router.put("/ai/guardrails/passcode", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in before setting an AI passcode." });
    return;
  }

  const input = passcodeBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({
      error: `Use a passcode with ${PASSCODE_MIN_LENGTH}–${PASSCODE_MAX_LENGTH} characters.`,
    });
    return;
  }

  try {
    const salt = randomBytes(16).toString("hex");
    const passcodeHash = await hashPasscode(input.data.passcode, salt);
    await pool.query(
      `INSERT INTO user_ai_guardrails (user_id, passcode_salt, passcode_hash, is_activated, updated_at)
       VALUES ($1, $2, $3, false, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET passcode_salt = EXCLUDED.passcode_salt,
           passcode_hash = EXCLUDED.passcode_hash,
           is_activated = false,
           failed_attempts = 0,
           locked_until = NULL,
           updated_at = NOW()`,
      [userId, salt, passcodeHash],
    );
    res.json({ passcodeConfigured: true, activated: false });
  } catch {
    res.status(503).json({ error: "The AI passcode could not be saved." });
  }
});

router.post("/ai/guardrails/activate", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in before activating AI." });
    return;
  }
  if (!aiServerEnabled()) {
    res.status(503).json({ error: "AI is disabled by the server switch." });
    return;
  }
  if (!aiProviderAvailableForUser(userId)) {
    res.status(503).json({ error: "AI cannot be activated until this account has a provider connection." });
    return;
  }

  const input = passcodeBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Enter your AI activation passcode." });
    return;
  }

  try {
    const result = await pool.query(
      "SELECT passcode_salt, passcode_hash, failed_attempts, locked_until FROM user_ai_guardrails WHERE user_id = $1",
      [userId],
    );
    const record = result.rows[0] as
      | {
          passcode_salt: string;
          passcode_hash: string;
          failed_attempts: number;
          locked_until: Date | null;
        }
      | undefined;
    if (!record) {
      res.status(409).json({ error: "Set your passcode before activating AI." });
      return;
    }
    if (record.locked_until && new Date(record.locked_until).getTime() > Date.now()) {
      res.status(429).json({ error: "Too many incorrect passcode attempts. Try again later." });
      return;
    }

    const candidate = await hashPasscode(input.data.passcode, record.passcode_salt);
    if (!validHash(candidate, record.passcode_hash)) {
      await pool.query(
        `UPDATE user_ai_guardrails
         SET failed_attempts = failed_attempts + 1,
             locked_until = CASE
               WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes'
               ELSE locked_until
             END,
             is_activated = false,
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId],
      );
      res.status(403).json({ error: "That activation passcode is not correct." });
      return;
    }

    await pool.query(
      "UPDATE user_ai_guardrails SET is_activated = true, failed_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE user_id = $1",
      [userId],
    );
    res.json({
      activated: true,
      requestsPerTab: AI_REQUESTS_PER_TAB,
      speechLimitSeconds: AI_SPEECH_LIMIT_SECONDS,
    });
  } catch {
    res.status(503).json({ error: "AI activation is temporarily unavailable." });
  }
});

router.post("/ai/guardrails/deactivate", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in before changing AI access." });
    return;
  }

  try {
    await pool.query(
      "UPDATE user_ai_guardrails SET is_activated = false, updated_at = NOW() WHERE user_id = $1",
      [userId],
    );
    res.json({ activated: false });
  } catch {
    res.status(503).json({ error: "AI access could not be stopped." });
  }
});

export async function reserveAiBriefingRequest(
  userId: string,
  briefingId: string,
  tab: z.infer<typeof aiRequestTab>,
): Promise<boolean> {
  if (!aiServerEnabled()) return false;

  const state = await pool.query(
    "SELECT is_activated FROM user_ai_guardrails WHERE user_id = $1",
    [userId],
  );
  if (state.rows[0]?.is_activated !== true) return false;

  const input = briefingRequestBody.safeParse({ briefingId, tab });
  if (!input.success) return false;

  // Reuse the existing unique (user_id, briefing_id) key as a tab-scoped reservation.
  const tabScopedBriefingId = `${input.data.briefingId}:${input.data.tab}`;
  const reservation = await pool.query(
    `INSERT INTO ai_briefing_requests (user_id, briefing_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, briefing_id) DO NOTHING
     RETURNING briefing_id`,
    [userId, tabScopedBriefingId],
  );
  return reservation.rowCount === 1;
}

export default router;
