// Copyright 2026 Sham Mohite
// Author: Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const KEY_ENV = "USER_CREDENTIALS_ENCRYPTION_KEY";
const AAD_PREFIX = "briefing-agent:telegram:v1:";

export type TelegramConfig = {
  botToken: string;
  chatId: string;
};

type EncryptedTelegramConfig = {
  encryptedConfig: string;
  iv: string;
  authTag: string;
};

function encryptionKey(): Buffer | null {
  const value = process.env[KEY_ENV]?.trim() ?? "";
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  return Buffer.from(value, "hex");
}

function userKey(userId: string, master: Buffer): Buffer {
  return Buffer.from(hkdfSync(
    "sha256",
    master,
    Buffer.from("briefing-agent-user-credentials"),
    Buffer.from(`telegram:${userId}`),
    32,
  ));
}

export function isTelegramCredentialStorageReady(): boolean {
  return encryptionKey() !== null;
}

export function encryptTelegramConfig(
  userId: string,
  config: TelegramConfig,
): EncryptedTelegramConfig {
  const master = encryptionKey();
  if (!master) throw new Error("Telegram credential storage is not configured.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", userKey(userId, master), iv);
  cipher.setAAD(Buffer.from(`${AAD_PREFIX}${userId}`));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(config), "utf8"),
    cipher.final(),
  ]);
  return {
    encryptedConfig: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptTelegramConfig(
  userId: string,
  record: EncryptedTelegramConfig,
): TelegramConfig {
  const master = encryptionKey();
  if (!master) throw new Error("Telegram credential storage is not configured.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    userKey(userId, master),
    Buffer.from(record.iv, "base64"),
  );
  decipher.setAAD(Buffer.from(`${AAD_PREFIX}${userId}`));
  decipher.setAuthTag(Buffer.from(record.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.encryptedConfig, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const value = JSON.parse(plaintext) as Partial<TelegramConfig>;
  if (
    typeof value.botToken !== "string" ||
    typeof value.chatId !== "string"
  ) {
    throw new Error("The saved Telegram connection is invalid.");
  }
  return { botToken: value.botToken, chatId: value.chatId };
}

export async function getTelegramConfigStatus(userId: string) {
  const storageReady = isTelegramCredentialStorageReady();
  if (!storageReady) {
    return { connected: false, storageReady, chatId: null, updatedAt: null };
  }
  const { pool } = await import("@workspace/db");
  const result = await pool.query<{
    encryptedConfig: string;
    iv: string;
    authTag: string;
    updatedAt: Date | string;
  }>(
    `SELECT encrypted_config AS "encryptedConfig", iv, auth_tag AS "authTag",
            updated_at AS "updatedAt"
     FROM telegram_user_credentials
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) {
    return { connected: false, storageReady, chatId: null, updatedAt: null };
  }
  const config = decryptTelegramConfig(userId, row);
  const updatedAt = row.updatedAt instanceof Date
    ? row.updatedAt.toISOString()
    : new Date(row.updatedAt).toISOString();
  return { connected: true, storageReady, chatId: config.chatId, updatedAt };
}

export async function getUserTelegramConfig(
  userId: string,
): Promise<TelegramConfig | null> {
  const { pool } = await import("@workspace/db");
  const result = await pool.query<EncryptedTelegramConfig>(
    `SELECT encrypted_config AS "encryptedConfig", iv, auth_tag AS "authTag"
     FROM telegram_user_credentials
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );
  const row = result.rows[0];
  return row ? decryptTelegramConfig(userId, row) : null;
}

export async function saveUserTelegramConfig(
  userId: string,
  config: TelegramConfig,
): Promise<void> {
  const { pool } = await import("@workspace/db");
  const encrypted = encryptTelegramConfig(userId, config);
  await pool.query(
    `INSERT INTO telegram_user_credentials
       (user_id, encrypted_config, iv, auth_tag, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       encrypted_config = EXCLUDED.encrypted_config,
       iv = EXCLUDED.iv,
       auth_tag = EXCLUDED.auth_tag,
       updated_at = NOW()`,
    [userId, encrypted.encryptedConfig, encrypted.iv, encrypted.authTag],
  );
}

export async function deleteUserTelegramConfig(userId: string): Promise<void> {
  const { pool } = await import("@workspace/db");
  await pool.query(
    "DELETE FROM telegram_user_credentials WHERE user_id = $1",
    [userId],
  );
}
