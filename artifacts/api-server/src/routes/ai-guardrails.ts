import { randomBytes } from "node:crypto";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  getAiProviderConfig,
  getAiProviderStatusForUser,
} from "../lib/ai-provider";
import {
  cancelActiveAiBriefingSummaries,
  QWEN_BATCH_BACKUP_TIMEOUT_MS,
  QWEN_BRIEF_WORD_LIMIT,
  QWEN_REQUEST_LIMIT,
  QWEN_REQUEST_WINDOW_MS,
  QWEN_MODEL_IDLE_UNLOAD_SECONDS,
  QWEN_REQUEST_TIMEOUT_MS,
  getQwenRequestRateLimitState,
} from "../lib/ai-briefing-summary";
import {
  deleteUserOllamaConfig,
  saveUserOllamaConfig,
} from "../lib/user-ollama-credentials";
import { verifyBriefingStartPin } from "../lib/briefing-start-pin";
import { hashBriefingPin } from "../lib/briefing-pin-crypto";

const router: IRouter = Router();
const AI_REQUESTS_PER_TAB = 1;
const AI_SPEECH_LIMIT_SECONDS = 120;
const QWEN_RATE_RESERVATION_PREFIX = "qwen-rate:";
const QWEN_REQUEST_WINDOW_SECONDS = QWEN_REQUEST_WINDOW_MS / 1000;
const aiRequestTab = z.enum(["news", "hire", "launch", "financial", "risk"]);

const passcodeBody = z.object({
  passcode: z.string().regex(/^\d{4}$/),
});
const ollamaConnectionBody = z.object({
  baseUrl: z.string().url().max(500),
  model: z.string().trim().min(1).max(120),
  authToken: z.string().max(2048).optional(),
});

const briefingRequestBody = z.object({
  briefingId: z.string().uuid(),
  tab: aiRequestTab,
});

function aiServerEnabled() {
  return process.env.AI_FEATURE_ENABLED === "true";
}

function authenticatedUserId(req: Parameters<typeof getAuth>[0]) {
  return getAuth(req).userId ?? null;
}

function sameOriginRequest(req: Parameters<typeof getAuth>[0]): boolean {
  const origin = req.get("origin");
  const host = (req.get("x-forwarded-host") ?? req.get("host") ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

router.use((req, res, next) => {
  if (req.method !== "GET" && !sameOriginRequest(req)) {
    res.status(403).json({ error: "The AI settings request must come from this app." });
    return;
  }
  next();
});

export async function getAiGuardrailStatus(userId: string) {
  const [result, providerStatus] = await Promise.all([
    pool.query<{ is_activated: boolean }>(
      "SELECT is_activated FROM user_ai_guardrails WHERE user_id = $1",
      [userId],
    ),
    getAiProviderStatusForUser(userId),
  ]);
  const serverEnabled = aiServerEnabled();
  return {
    provider: providerStatus.provider,
    aiProviderMessage: providerStatus.message,
    serverEnabled,
    passcodeConfigured: (result.rowCount ?? 0) > 0,
    activated:
      result.rows[0]?.is_activated === true &&
      serverEnabled &&
      providerStatus.connected,
    requestsPerTab: AI_REQUESTS_PER_TAB,
    speechLimitSeconds: AI_SPEECH_LIMIT_SECONDS,
    qwenRequestTimeoutSeconds: QWEN_REQUEST_TIMEOUT_MS / 1000,
    qwenRequestLimit: QWEN_REQUEST_LIMIT,
    qwenRequestWindowSeconds: QWEN_REQUEST_WINDOW_SECONDS,
    qwenBriefWordLimit: QWEN_BRIEF_WORD_LIMIT,
    qwenBatchBackupSeconds: QWEN_BATCH_BACKUP_TIMEOUT_MS / 1000,
    qwenModelIdleUnloadSeconds: QWEN_MODEL_IDLE_UNLOAD_SECONDS,
    aiProviderConnected: providerStatus.connected,
    model: providerStatus.model,
    providerEndpoint: providerStatus.providerEndpoint,
  };
}

router.get("/ai/guardrails", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to view AI access settings." });
    return;
  }

  try {
    res.json(await getAiGuardrailStatus(userId));
  } catch {
    res.status(503).json({ error: "AI access settings are unavailable." });
  }
});

router.put("/ai/guardrails/passcode", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  if (!userId) {
      res.status(401).json({ error: "Sign in before setting your briefing PIN." });
    return;
  }

  const input = passcodeBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({
      error: "Set a four-digit PIN. The same PIN protects crawl starts and AI activation.",
    });
    return;
  }

  try {
    const salt = randomBytes(16).toString("hex");
    const passcodeHash = await hashBriefingPin(input.data.passcode, salt);
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
    res.json({ passcodeConfigured: true, startPinConfigured: true, activated: false });
  } catch {
    res.status(503).json({ error: "Your briefing PIN could not be saved." });
  }
});

router.put("/ai/guardrails/connection", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in before saving an Ollama connection." });
    return;
  }
  const input = ollamaConnectionBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Enter an endpoint URL, model name, and optional bearer token." });
    return;
  }
  try {
    await saveUserOllamaConfig(userId, input.data);
    await pool.query(
      "UPDATE user_ai_guardrails SET is_activated = false, updated_at = NOW() WHERE user_id = $1",
      [userId],
    );
    res.json({ saved: true, activated: false });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error
        ? error.message
        : "The Ollama connection could not be saved.",
    });
  }
});

router.delete("/ai/guardrails/connection", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in before removing an Ollama connection." });
    return;
  }
  try {
    await deleteUserOllamaConfig(userId);
    await pool.query(
      "UPDATE user_ai_guardrails SET is_activated = false, updated_at = NOW() WHERE user_id = $1",
      [userId],
    );
    cancelActiveAiBriefingSummaries(userId);
    res.json({ removed: true, activated: false });
  } catch {
    res.status(503).json({ error: "The saved Ollama connection could not be removed." });
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
  const input = passcodeBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Enter your four-digit account PIN." });
    return;
  }

  try {
    const configuredPin = await pool.query(
      "SELECT 1 FROM user_ai_guardrails WHERE user_id = $1",
      [userId],
    );
    if ((configuredPin.rowCount ?? 0) === 0) {
      res.status(409).json({ error: "Set your four-digit briefing PIN before activating AI." });
      return;
    }

    const pinCheck = await verifyBriefingStartPin(userId, input.data.passcode);
    if (!pinCheck.valid) {
      res.status(pinCheck.status).json({ error: pinCheck.message });
      return;
    }

    if (!(await getAiProviderStatusForUser(userId)).connected) {
      res.status(503).json({
        error: "AI cannot be activated until your saved Ollama connection and model are available.",
      });
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
    const cancelledActiveSummaries = cancelActiveAiBriefingSummaries(userId);
    res.json({ activated: false, cancelledActiveSummaries });
  } catch {
    res.status(503).json({ error: "AI access could not be stopped." });
  }
});

export async function reserveAiBriefingBatch(
  userId: string,
  briefingId: string,
  topics: z.infer<typeof aiRequestTab>[],
): Promise<
  | { allowed: true }
  | { allowed: false; reason: "disabled" | "inactive" | "rate-limit"; retryAfterSeconds?: number }
> {
  if (!aiServerEnabled()) return { allowed: false, reason: "disabled" };

  if (topics.length < 1 || topics.length > QWEN_REQUEST_LIMIT) {
    return { allowed: false, reason: "rate-limit", retryAfterSeconds: QWEN_REQUEST_WINDOW_SECONDS };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`briefing-agent-qwen-rate-limit:${userId}`],
    );
    const state = await client.query<{ is_activated: boolean }>(
      "SELECT is_activated FROM user_ai_guardrails WHERE user_id = $1 FOR UPDATE",
      [userId],
    );
    if (state.rows[0]?.is_activated !== true) {
      await client.query("COMMIT");
      return { allowed: false, reason: "inactive" };
    }

    await client.query(
      `DELETE FROM ai_briefing_requests
       WHERE user_id = $1
         AND briefing_id LIKE $2
         AND created_at < NOW() - INTERVAL '5 minutes'`,
      [userId, `${QWEN_RATE_RESERVATION_PREFIX}%`],
    );
    const usage = await client.query<{ created_at: Date | string }>(
      `SELECT created_at FROM ai_briefing_requests
       WHERE user_id = $1
         AND briefing_id LIKE $2
         AND created_at >= NOW() - INTERVAL '5 minutes'
       ORDER BY created_at ASC`,
      [userId, `${QWEN_RATE_RESERVATION_PREFIX}%`],
    );
    const now = Date.now();
    const rate = getQwenRequestRateLimitState(
      usage.rows.map((row) =>
        row.created_at instanceof Date
          ? row.created_at.getTime()
          : new Date(row.created_at).getTime(),
      ),
      topics.length,
      now,
    );
    if (!rate.allowed) {
      await client.query("COMMIT");
      return {
        allowed: false,
        reason: "rate-limit",
        retryAfterSeconds: rate.retryAfterSeconds,
      };
    }

    const reservedIds = topics.map((topic) =>
      `${QWEN_RATE_RESERVATION_PREFIX}${briefingId}:${topic}`,
    );
    const reserved = await client.query(
      `INSERT INTO ai_briefing_requests (user_id, briefing_id)
       SELECT $1, unnest($2::text[])
       ON CONFLICT (user_id, briefing_id) DO NOTHING
       RETURNING briefing_id`,
      [userId, reservedIds],
    );
    if (reserved.rowCount !== reservedIds.length) {
      await client.query("ROLLBACK");
      return { allowed: false, reason: "rate-limit", retryAfterSeconds: QWEN_REQUEST_WINDOW_SECONDS };
    }
    await client.query("COMMIT");
    return { allowed: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function reserveAiBriefingRequest(
  userId: string,
  briefingId: string,
  tab: z.infer<typeof aiRequestTab>,
): Promise<boolean> {
  if (!aiServerEnabled()) return false;
  if (!await getAiProviderConfig(userId)) return false;

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
