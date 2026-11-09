import { getAuth } from "@clerk/express";
import {
  DeleteAiCredentialResponse,
  GetAiCredentialResponse,
  SaveAiCredentialBody,
  SaveAiCredentialResponse,
} from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { Router, type IRouter, type Request } from "express";
import {
  deleteUserAiConfig,
  getAiCredentialStatus,
  isAiCredentialStorageAvailable,
  saveUserAiConfig,
} from "../lib/user-ai-credentials";

const router: IRouter = Router();

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  next();
});

function authenticatedUserId(req: Request): string | null {
  return getAuth(req).userId ?? null;
}

function sameOriginRequest(req: Request): boolean {
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

router.get("/ai-credentials", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to manage your AI key." });
    return;
  }

  try {
    res.json(GetAiCredentialResponse.parse(await getAiCredentialStatus(userId)));
  } catch {
    req.log.error({}, "AI credential status could not be loaded");
    res.status(500).json({ error: "AI credential status could not be loaded." });
  }
});

router.put("/ai-credentials", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to save your AI key." });
    return;
  }
  if (!sameOriginRequest(req)) {
    res.status(403).json({ error: "The credential request must come from this app." });
    return;
  }

  const input = SaveAiCredentialBody.safeParse(req.body);
  const apiKey = input.success ? input.data.apiKey.trim() : "";
  const model = input.success ? input.data.model.trim() : "";
  if (!input.success || apiKey.length < 20 || !model) {
    res.status(400).json({ error: "Enter a valid OpenAI API key and model ID." });
    return;
  }
  if (!isAiCredentialStorageAvailable()) {
    res.status(503).json({
      error: "Secure key storage is not configured on the server yet.",
    });
    return;
  }

  try {
    await saveUserAiConfig(userId, apiKey, model);
    await pool.query(
      "UPDATE user_ai_guardrails SET is_activated = false, updated_at = NOW() WHERE user_id = $1",
      [userId],
    );
    res.json(SaveAiCredentialResponse.parse({
      connected: true,
      storageReady: true,
      model,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    req.log.error({}, "AI credential could not be saved");
    res.status(500).json({ error: "AI key could not be saved securely." });
  }
});

router.delete("/ai-credentials", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to remove your AI key." });
    return;
  }
  if (!sameOriginRequest(req)) {
    res.status(403).json({ error: "The credential request must come from this app." });
    return;
  }

  try {
    await deleteUserAiConfig(userId);
    await pool.query(
      "UPDATE user_ai_guardrails SET is_activated = false, updated_at = NOW() WHERE user_id = $1",
      [userId],
    );
    res.json(DeleteAiCredentialResponse.parse({
      connected: false,
      storageReady: isAiCredentialStorageAvailable(),
      model: null,
      updatedAt: null,
    }));
  } catch {
    req.log.error({}, "AI credential could not be removed");
    res.status(500).json({ error: "AI key could not be removed." });
  }
});

export default router;
