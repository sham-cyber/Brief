// Copyright 2026 Sham Mohite
// Author: Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import { getAuth } from "@clerk/express";
import {
  DeleteTelegramCredentialResponse,
  GetTelegramCredentialResponse,
  SaveTelegramCredentialBody,
  SaveTelegramCredentialResponse,
  SendTelegramBriefingPdfHeader,
  SendTelegramBriefingPdfResponse,
  TestTelegramCredentialResponse,
} from "@workspace/api-zod";
import express, { Router, type IRouter, type Request, type Response } from "express";
import { resolveOwnerUserId } from "../lib/briefing-owner";
import { verifyBriefingStartPin } from "../lib/briefing-start-pin";
import {
  deleteUserTelegramConfig,
  getTelegramConfigStatus,
  getUserTelegramConfig,
  isTelegramCredentialStorageReady,
  saveUserTelegramConfig,
} from "../lib/user-telegram-credentials";
import {
  getTelegramPdfUsage,
  markTelegramPdfSent,
  releaseTelegramPdfReservation,
  reserveTelegramPdf,
} from "../lib/telegram-pdf-quota";

const router: IRouter = Router();

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  next();
});

type TelegramApiOutcome =
  | {
      success: true;
      result?: {
        id?: number;
        first_name?: string;
        username?: string;
        message_id?: number;
      };
    }
  | { success: false; definitiveRejection: boolean };

type TelegramApiResult = {
  ok: boolean;
  result?: {
    id?: number;
    first_name?: string;
    username?: string;
    message_id?: number;
  };
};

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

async function requireOwner(
  req: Request,
  res: Response,
  action: string,
): Promise<string | null> {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: `Sign in before ${action}.` });
    return null;
  }
  const ownerEmail = process.env.BRIEFING_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) {
    res.status(503).json({
      error: "The allowed briefing owner is not configured in API Server Secrets.",
    });
    return null;
  }
  let ownerUserId: string | null;
  try {
    ownerUserId = await resolveOwnerUserId(ownerEmail);
  } catch {
    req.log.error({}, "Telegram owner account could not be verified");
    res.status(503).json({ error: "The Telegram owner account could not be verified." });
    return null;
  }
  if (!ownerUserId) {
    res.status(503).json({
      error: "The configured briefing owner was not found in this Clerk environment.",
    });
    return null;
  }
  if (userId !== ownerUserId) {
    res.status(403).json({ error: "Only the configured briefing owner can use Telegram delivery." });
    return null;
  }
  return userId;
}

async function telegramApi(
  botToken: string,
  method: string,
  init?: RequestInit,
): Promise<TelegramApiOutcome> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/${method}`,
      { ...init, signal: AbortSignal.timeout(20_000) },
    );
    const value = await response.json().catch(() => null) as TelegramApiResult | null;
    if (response.ok && value?.ok) {
      return { success: true, result: value.result };
    }
    return {
      success: false,
      definitiveRejection: response.status >= 400 && response.status < 500,
    };
  } catch {
    return { success: false, definitiveRejection: false };
  }
}

async function telegramStatus(userId: string) {
  const [credential, usage] = await Promise.all([
    getTelegramConfigStatus(userId),
    getTelegramPdfUsage(userId),
  ]);
  return { ...credential, ...usage };
}

router.get("/telegram-credentials", async (req, res): Promise<void> => {
  const userId = await requireOwner(req, res, "checking Telegram setup");
  if (!userId) return;
  try {
    res.json(GetTelegramCredentialResponse.parse(await telegramStatus(userId)));
  } catch {
    req.log.error({}, "Telegram connection status could not be loaded");
    res.status(500).json({ error: "Telegram connection status could not be loaded." });
  }
});

router.put("/telegram-credentials", async (req, res): Promise<void> => {
  const userId = await requireOwner(req, res, "saving Telegram setup");
  if (!userId) return;
  if (!sameOriginRequest(req)) {
    res.status(403).json({ error: "The Telegram credential request must come from this app." });
    return;
  }
  const input = SaveTelegramCredentialBody.safeParse({
    ...req.body,
    botToken: typeof req.body?.botToken === "string" ? req.body.botToken.trim() : "",
    chatId: typeof req.body?.chatId === "string" ? req.body.chatId.trim() : "",
  });
  if (!input.success) {
    res.status(400).json({ error: "Enter a valid Telegram bot token and chat ID." });
    return;
  }
  if (!isTelegramCredentialStorageReady()) {
    res.status(503).json({
      error: "Secure credential storage is not configured on the server yet.",
    });
    return;
  }
  try {
    await saveUserTelegramConfig(userId, input.data);
    res.json(SaveTelegramCredentialResponse.parse(await telegramStatus(userId)));
  } catch {
    req.log.error({}, "Telegram connection could not be saved");
    res.status(500).json({ error: "Telegram connection could not be saved securely." });
  }
});

router.delete("/telegram-credentials", async (req, res): Promise<void> => {
  const userId = await requireOwner(req, res, "removing Telegram setup");
  if (!userId) return;
  if (!sameOriginRequest(req)) {
    res.status(403).json({ error: "The Telegram credential request must come from this app." });
    return;
  }
  try {
    await deleteUserTelegramConfig(userId);
    res.json(DeleteTelegramCredentialResponse.parse({
      ...(await telegramStatus(userId)),
      connected: false,
      chatId: null,
      updatedAt: null,
    }));
  } catch {
    req.log.error({}, "Telegram connection could not be removed");
    res.status(500).json({ error: "Telegram connection could not be removed." });
  }
});

router.post("/telegram-credentials/test", async (req, res): Promise<void> => {
  const userId = await requireOwner(req, res, "testing Telegram setup");
  if (!userId) return;
  if (!sameOriginRequest(req)) {
    res.status(403).json({ error: "The Telegram test request must come from this app." });
    return;
  }
  try {
    const config = await getUserTelegramConfig(userId);
    if (!config) {
      res.status(400).json({
        error: "Save the bot token and chat ID before testing the connection.",
      });
      return;
    }
    const chatQuery = new URLSearchParams({ chat_id: config.chatId });
    const [bot, chat] = await Promise.all([
      telegramApi(config.botToken, "getMe"),
      telegramApi(config.botToken, `getChat?${chatQuery.toString()}`),
    ]);
    const connected = bot.success && chat.success;
    const result = TestTelegramCredentialResponse.parse({
      connected,
      botName: bot.success
        ? bot.result?.username
          ? `@${bot.result.username}`
          : bot.result?.first_name ?? null
        : null,
      chatId: config.chatId,
      message: connected
        ? "Bot and destination verified. No Telegram message was sent."
        : "Telegram could not verify the bot or chat. Check the token, chat ID, and that you started the bot.",
    });
    res.json(result);
  } catch {
    req.log.error({}, "Telegram connection test failed");
    res.status(500).json({ error: "Telegram connection test failed." });
  }
});

router.post(
  "/telegram-send",
  express.raw({ type: "application/pdf", limit: "500kb" }),
  async (req, res): Promise<void> => {
    const userId = await requireOwner(req, res, "sending a Telegram PDF");
    if (!userId) return;
    if (!sameOriginRequest(req)) {
      res.status(403).json({ error: "The Telegram send request must come from this app." });
      return;
    }
    const header = SendTelegramBriefingPdfHeader.safeParse({
      "X-Briefing-Start-Pin": req.get("X-Briefing-Start-Pin"),
      "X-Briefing-Filename": req.get("X-Briefing-Filename") ?? undefined,
    });
    if (!header.success) {
      res.status(400).json({ error: "Enter the four-digit start PIN." });
      return;
    }
    const pinCheck = verifyBriefingStartPin(
      userId,
      header.data["X-Briefing-Start-Pin"],
    );
    if (!pinCheck.valid) {
      if (pinCheck.retryAfterSeconds) {
        res.setHeader("Retry-After", String(pinCheck.retryAfterSeconds));
      }
      res.status(pinCheck.status).json({ error: pinCheck.message });
      return;
    }
    if (!Buffer.isBuffer(req.body) || req.body.length < 8 || req.body.length > 500 * 1024) {
      res.status(400).json({ error: "Upload a valid PDF no larger than 500 KB." });
      return;
    }
    if (req.body.subarray(0, 5).toString("ascii") !== "%PDF-") {
      res.status(400).json({ error: "The uploaded document is not a PDF." });
      return;
    }

    let config;
    try {
      config = await getUserTelegramConfig(userId);
    } catch {
      req.log.error({}, "Saved Telegram credentials could not be read");
      res.status(503).json({ error: "The saved Telegram connection is unavailable." });
      return;
    }
    if (!config) {
      res.status(503).json({ error: "Set up Telegram delivery before sending a PDF." });
      return;
    }

    let reservation;
    try {
      reservation = await reserveTelegramPdf(userId);
    } catch {
      req.log.error({}, "Telegram PDF limit could not be reserved");
      res.status(503).json({ error: "Telegram delivery limits are temporarily unavailable." });
      return;
    }
    if (!reservation.allowed || reservation.reservationId === null) {
      res.setHeader("Retry-After", String(reservation.retryAfterSeconds));
      res.status(429).json({
        error: "The three-PDF rolling-hour limit has been reached.",
      });
      return;
    }

    const form = new FormData();
    form.set("chat_id", config.chatId);
    form.set(
      "document",
      new Blob([Uint8Array.from(req.body).buffer as ArrayBuffer], { type: "application/pdf" }),
      header.data["X-Briefing-Filename"] ?? "briefing.pdf",
    );
    form.set("caption", "One-page source-linked briefing.");
    const telegramResult = await telegramApi(
      config.botToken,
      "sendDocument",
      { method: "POST", body: form },
    );
    if (!telegramResult.success) {
      if (telegramResult.definitiveRejection) {
        try {
          await releaseTelegramPdfReservation(reservation.reservationId);
        } catch {
          req.log.warn({}, "Rejected Telegram delivery reservation remains counted until expiry");
        }
      } else {
        req.log.warn({}, "Telegram delivery result is uncertain; quota reservation remains until expiry");
      }
      res.status(502).json({
        error: telegramResult.definitiveRejection
          ? "Telegram rejected the PDF. Check the saved destination and try again."
          : "Telegram did not confirm delivery. This send slot remains reserved for one hour to prevent a duplicate PDF; check the Telegram chat before retrying.",
      });
      return;
    }

    try {
      await markTelegramPdfSent(reservation.reservationId);
    } catch {
      req.log.warn({}, "Telegram PDF was sent but delivery status could not be updated");
    }
    res.json(SendTelegramBriefingPdfResponse.parse({
      sent: true,
      sentAt: new Date().toISOString(),
      remaining: reservation.remaining,
      windowResetsAt: reservation.windowResetsAt,
    }));
  },
);

export default router;
