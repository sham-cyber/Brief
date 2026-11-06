// Copyright 2026 Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import { getAuth } from "@clerk/express";
import {
  DeleteSapConnectionSettingsResponse,
  GetSapConnectionSettingsResponse,
  SaveSapConnectionSettingsBody,
  SaveSapConnectionSettingsResponse,
  TestSapConnectionResponse,
} from "@workspace/api-zod";
import { Router, type IRouter, type Request } from "express";
import { resolveOwnerUserId } from "../lib/briefing-owner";
import {
  deleteSapConnectionSettings,
  getSapConnectionSettings,
  saveSapConnectionSettings,
  testSapConnection,
} from "../lib/sap-s4hana";
import { isSapCredentialStorageReady } from "../lib/user-sap-connection";

const router: IRouter = Router();
const testAttempts = new Map<string, number>();
const TEST_INTERVAL_MS = 30_000;

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  next();
});

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

async function configuredOwnerId(req: Request): Promise<string | null> {
  const userId = getAuth(req).userId;
  if (!userId) return null;
  const email = process.env.BRIEFING_OWNER_EMAIL?.trim().toLowerCase();
  if (!email) return null;
  const ownerUserId = await resolveOwnerUserId(email);
  return ownerUserId === userId ? userId : null;
}

router.get("/sap-connection", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to manage the SAP connection." });
    return;
  }

  try {
    const ownerId = await configuredOwnerId(req);
    if (!ownerId) {
      res.status(403).json({ error: "Only the configured app owner can manage the SAP connection." });
      return;
    }
    res.json(GetSapConnectionSettingsResponse.parse(
      await getSapConnectionSettings(ownerId),
    ));
  } catch (error) {
    req.log.error({ error }, "Failed to load SAP connection settings");
    res.status(503).json({ error: "SAP connection settings could not be loaded." });
  }
});

router.put("/sap-connection", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to save the SAP connection." });
    return;
  }
  if (!sameOriginRequest(req)) {
    res.status(403).json({ error: "The SAP settings request did not come from this app." });
    return;
  }

  const parsed = SaveSapConnectionSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Check the SAP URLs, OAuth credentials, organization list, and area mappings.",
    });
    return;
  }
  if (!isSapCredentialStorageReady()) {
    res.status(503).json({ error: "Encrypted SAP credential storage is not configured." });
    return;
  }

  try {
    const ownerId = await configuredOwnerId(req);
    if (!ownerId) {
      res.status(403).json({ error: "Only the configured app owner can manage the SAP connection." });
      return;
    }
    await saveSapConnectionSettings(ownerId, parsed.data);
    res.json(SaveSapConnectionSettingsResponse.parse(
      await getSapConnectionSettings(ownerId),
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("Enter both OAuth") || message.startsWith("The SAP settings")) {
      res.status(400).json({ error: message });
      return;
    }
    req.log.error({ error }, "Failed to save SAP connection settings");
    res.status(503).json({ error: "SAP settings could not be saved securely." });
  }
});

router.post("/sap-connection/test", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to test the SAP connection." });
    return;
  }
  if (!sameOriginRequest(req)) {
    res.status(403).json({ error: "The SAP test request did not come from this app." });
    return;
  }

  try {
    const ownerId = await configuredOwnerId(req);
    if (!ownerId) {
      res.status(403).json({ error: "Only the configured app owner can test the SAP connection." });
      return;
    }
    const now = Date.now();
    const previous = testAttempts.get(ownerId) ?? 0;
    if (now - previous < TEST_INTERVAL_MS) {
      res.status(429).json({ error: "Wait 30 seconds before testing the SAP connection again." });
      return;
    }
    testAttempts.set(ownerId, now);

    try {
      res.json(TestSapConnectionResponse.parse(await testSapConnection(ownerId)));
    } catch (error) {
      req.log.warn(
        { errorName: error instanceof Error ? error.name : "unknown" },
        "SAP connection test failed",
      );
      res.json(TestSapConnectionResponse.parse({
        connected: false,
        checkedAt: new Date().toISOString(),
        message: "Connection failed. Check the HTTPS URLs, OAuth credentials, and SAP OData communication setup.",
      }));
    }
  } catch (error) {
    req.log.error({ error }, "Failed to authorize SAP connection test");
    res.status(503).json({ error: "The SAP owner account could not be verified." });
  }
});

router.delete("/sap-connection", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to remove the SAP connection." });
    return;
  }
  if (!sameOriginRequest(req)) {
    res.status(403).json({ error: "The SAP settings request did not come from this app." });
    return;
  }

  try {
    const ownerId = await configuredOwnerId(req);
    if (!ownerId) {
      res.status(403).json({ error: "Only the configured app owner can remove the SAP connection." });
      return;
    }
    const deleted = await deleteSapConnectionSettings(ownerId);
    res.json(DeleteSapConnectionSettingsResponse.parse({ deleted }));
  } catch (error) {
    req.log.error({ error }, "Failed to delete SAP connection settings");
    res.status(503).json({ error: "SAP settings could not be removed." });
  }
});

export default router;
