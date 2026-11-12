// Copyright 2026 Sham Mohite
// Author: Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import webpush, { type PushSubscription } from "web-push";
import { pool } from "@workspace/db";

const ENCRYPTION_KEY_NAME = "USER_CREDENTIALS_ENCRYPTION_KEY";
const WEB_PUSH_PUBLIC_KEY_NAME = "WEB_PUSH_VAPID_PUBLIC_KEY";
const WEB_PUSH_PRIVATE_KEY_NAME = "WEB_PUSH_VAPID_PRIVATE_KEY";
const WEB_PUSH_SUBJECT_NAME = "WEB_PUSH_VAPID_SUBJECT";

type EncryptedSubscription = {
  endpointHash: string;
  encryptedSubscription: string;
  iv: string;
  authTag: string;
};

function encryptionKey(): Buffer | null {
  const value = process.env[ENCRYPTION_KEY_NAME]?.trim();
  return value && /^[a-fA-F0-9]{64}$/.test(value) ? Buffer.from(value, "hex") : null;
}

function endpointHash(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

function allowedPushEndpoint(endpoint: string): boolean {
  try {
    const parsed = new URL(endpoint);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === "https:" && (
      host === "fcm.googleapis.com" ||
      host === "updates.push.services.mozilla.com" ||
      host === "push.services.mozilla.com" ||
      host === "web.push.apple.com" ||
      host.endsWith(".notify.windows.com")
    );
  } catch {
    return false;
  }
}

function webPushConfig() {
  const publicKey = process.env[WEB_PUSH_PUBLIC_KEY_NAME]?.trim();
  const privateKey = process.env[WEB_PUSH_PRIVATE_KEY_NAME]?.trim();
  const subject = process.env[WEB_PUSH_SUBJECT_NAME]?.trim() ||
    (process.env.BRIEFING_OWNER_EMAIL?.trim()
      ? `mailto:${process.env.BRIEFING_OWNER_EMAIL.trim()}`
      : "");
  if (!publicKey || !privateKey || !subject || !encryptionKey()) return null;
  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) return null;
  return { publicKey, privateKey, subject };
}

let configuredVapidKey = "";
function configureWebPush(): boolean {
  const config = webPushConfig();
  if (!config) return false;
  const fingerprint = `${config.publicKey}:${config.privateKey}:${config.subject}`;
  if (configuredVapidKey !== fingerprint) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    configuredVapidKey = fingerprint;
  }
  return true;
}

export function getWebPushStatus() {
  return {
    configured: configureWebPush(),
    publicKey: configureWebPush() ? webPushConfig()?.publicKey ?? null : null,
  };
}

function encryptSubscription(userId: string, subscription: PushSubscription) {
  const key = encryptionKey();
  if (!key) throw new Error("Encrypted push storage is not configured.");
  const endpointDigest = endpointHash(subscription.endpoint);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`web-push:${userId}:${endpointDigest}`, "utf8"));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(subscription), "utf8"),
    cipher.final(),
  ]);
  return {
    endpointHash: endpointDigest,
    encryptedSubscription: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptSubscription(userId: string, record: EncryptedSubscription): PushSubscription {
  const key = encryptionKey();
  if (!key) throw new Error("Encrypted push storage is not configured.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(record.iv, "base64"));
    decipher.setAAD(Buffer.from(`web-push:${userId}:${record.endpointHash}`, "utf8"));
    decipher.setAuthTag(Buffer.from(record.authTag, "base64"));
    const json = Buffer.concat([
      decipher.update(Buffer.from(record.encryptedSubscription, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(json) as PushSubscription;
  } catch {
    throw new Error("A saved push subscription could not be decrypted.");
  }
}

export async function saveWebPushSubscription(
  userId: string,
  subscription: PushSubscription,
): Promise<void> {
  if (!allowedPushEndpoint(subscription.endpoint)) {
    throw new Error("This browser push endpoint is not supported.");
  }
  const encrypted = encryptSubscription(userId, subscription);
  await pool.query(
    `INSERT INTO web_push_subscriptions (
       id, user_id, endpoint_hash, encrypted_subscription, iv, auth_tag, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT (user_id, endpoint_hash)
     DO UPDATE SET
       encrypted_subscription = EXCLUDED.encrypted_subscription,
       iv = EXCLUDED.iv,
       auth_tag = EXCLUDED.auth_tag,
       updated_at = NOW()`,
    [
      randomUUID(),
      userId,
      encrypted.endpointHash,
      encrypted.encryptedSubscription,
      encrypted.iv,
      encrypted.authTag,
    ],
  );
}

export async function deleteWebPushSubscription(userId: string, endpoint: string): Promise<void> {
  await pool.query(
    "DELETE FROM web_push_subscriptions WHERE user_id = $1 AND endpoint_hash = $2",
    [userId, endpointHash(endpoint)],
  );
}

export async function hasWebPushSubscriptions(userId: string): Promise<boolean> {
  const result = await pool.query(
    "SELECT 1 FROM web_push_subscriptions WHERE user_id = $1 LIMIT 1",
    [userId],
  );
  return result.rowCount === 1;
}

export async function sendManualBriefReadyNotification(userId: string): Promise<void> {
  if (!configureWebPush()) return;
  const key = encryptionKey();
  if (!key) return;
  const result = await pool.query<EncryptedSubscription>(
    `SELECT endpoint_hash AS "endpointHash",
            encrypted_subscription AS "encryptedSubscription",
            iv,
            auth_tag AS "authTag"
     FROM web_push_subscriptions
     WHERE user_id = $1`,
    [userId],
  );

  await Promise.all(result.rows.map(async (record) => {
    const subscription = decryptSubscription(userId, record);
    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify({ url: "/" }),
        { TTL: 60, urgency: "low" },
      );
    } catch (error) {
      const statusCode = typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : 0;
      if (statusCode === 404 || statusCode === 410) {
        await deleteWebPushSubscription(userId, subscription.endpoint);
      } else {
        throw error;
      }
    }
  }));
}
