import { getAuth } from "@clerk/express";
import {
  DeleteTavilyCredentialResponse,
  GetTavilyCredentialResponse,
  SaveTavilyCredentialBody,
  SaveTavilyCredentialResponse,
} from "@workspace/api-zod";
import { Router, type IRouter, type Request } from "express";
import {
  deleteUserTavilyApiKey,
  getTavilyCredentialStatus,
  isCredentialStorageAvailable,
  saveUserTavilyApiKey,
} from "../lib/user-tavily-credentials";

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

router.get("/tavily-credentials", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to manage your Tavily key." });
    return;
  }

  try {
    res.json(GetTavilyCredentialResponse.parse(
      await getTavilyCredentialStatus(userId),
    ));
  } catch {
    req.log.error({}, "Tavily credential status could not be loaded");
    res.status(500).json({ error: "Tavily credential status could not be loaded." });
  }
});

router.put("/tavily-credentials", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to save your Tavily key." });
    return;
  }
  if (!sameOriginRequest(req)) {
    res.status(403).json({ error: "The credential request must come from this app." });
    return;
  }

  const input = SaveTavilyCredentialBody.safeParse(req.body);
  const normalizedKey = input.success ? input.data.apiKey.trim() : "";
  if (!input.success || normalizedKey.length < 20) {
    res.status(400).json({ error: "Enter a valid Tavily API key." });
    return;
  }
  if (!isCredentialStorageAvailable()) {
    res.status(503).json({
      error: "Secure key storage is not configured on the server yet.",
    });
    return;
  }

  try {
    await saveUserTavilyApiKey(userId, normalizedKey);
    res.json(SaveTavilyCredentialResponse.parse({
      connected: true,
      storageReady: true,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    req.log.error({}, "Tavily credential could not be saved");
    res.status(500).json({ error: "Tavily key could not be saved securely." });
  }
});

router.delete("/tavily-credentials", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to remove your Tavily key." });
    return;
  }
  if (!sameOriginRequest(req)) {
    res.status(403).json({ error: "The credential request must come from this app." });
    return;
  }

  try {
    await deleteUserTavilyApiKey(userId);
    res.json(DeleteTavilyCredentialResponse.parse({
      connected: false,
      storageReady: isCredentialStorageAvailable(),
      updatedAt: null,
    }));
  } catch {
    req.log.error({}, "Tavily credential could not be removed");
    res.status(500).json({ error: "Tavily key could not be removed." });
  }
});

export default router;
