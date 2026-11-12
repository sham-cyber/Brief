// Copyright 2026 Sham Mohite
// Author: Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import { getAuth } from "@clerk/express";
import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import {
  deleteWebPushSubscription,
  getWebPushStatus,
  hasWebPushSubscriptions,
  saveWebPushSubscription,
} from "../lib/web-push";

const router: IRouter = Router();
const subscriptionBody = z.object({
  endpoint: z.string().url().max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(20).max(512),
    auth: z.string().min(12).max(256),
  }),
});
const deleteBody = z.object({ endpoint: z.string().url().max(2048) });

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

router.get("/push-notifications/status", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to manage push notifications." });
    return;
  }
  try {
    res.json({
      ...getWebPushStatus(),
      subscribed: await hasWebPushSubscriptions(userId),
    });
  } catch {
    req.log.error({}, "Push notification settings could not be loaded");
    res.status(503).json({ error: "Push notification settings could not be loaded." });
  }
});

router.post("/push-notifications/subscriptions", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to enable push notifications." });
    return;
  }
  if (!sameOriginRequest(req)) {
    res.status(403).json({ error: "The push subscription request must come from this app." });
    return;
  }
  if (!getWebPushStatus().configured) {
    res.status(503).json({ error: "Push alerts are not configured on this server." });
    return;
  }
  const input = subscriptionBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "The browser push subscription is invalid." });
    return;
  }
  try {
    await saveWebPushSubscription(userId, input.data);
    res.json({ subscribed: true });
  } catch (error) {
    req.log.error({ error }, "Push subscription could not be saved");
    res.status(503).json({ error: "The push subscription could not be saved securely." });
  }
});

router.delete("/push-notifications/subscriptions", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to disable push notifications." });
    return;
  }
  if (!sameOriginRequest(req)) {
    res.status(403).json({ error: "The push subscription request must come from this app." });
    return;
  }
  const input = deleteBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "The browser push subscription is invalid." });
    return;
  }
  try {
    await deleteWebPushSubscription(userId, input.data.endpoint);
    res.json({ subscribed: false });
  } catch {
    req.log.error({}, "Push subscription could not be removed");
    res.status(503).json({ error: "The push subscription could not be removed." });
  }
});

export default router;
