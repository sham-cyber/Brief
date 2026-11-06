// Copyright 2026 Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const KEY_ENV = "USER_CREDENTIALS_ENCRYPTION_KEY";
const AAD_PREFIX = "briefing-agent:sap-s4hana:v1:";

type EncryptedConfig = {
  encryptedConfig: string;
  iv: string;
  authTag: string;
};

function masterKey(): Buffer | null {
  const value = process.env[KEY_ENV]?.trim() ?? "";
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  return Buffer.from(value, "hex");
}

function userKey(userId: string, master: Buffer): Buffer {
  return Buffer.from(hkdfSync(
    "sha256",
    master,
    Buffer.from("briefing-agent-user-credentials"),
    Buffer.from(`sap-s4hana:${userId}`),
    32,
  ));
}

export function isSapCredentialStorageReady(): boolean {
  return masterKey() !== null;
}

export function encryptSapConfig(userId: string, value: unknown): EncryptedConfig {
  const master = masterKey();
  if (!master) throw new Error("SAP credential storage is not configured.");

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", userKey(userId, master), iv);
  cipher.setAAD(Buffer.from(`${AAD_PREFIX}${userId}`));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);

  return {
    encryptedConfig: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSapConfig(
  userId: string,
  value: EncryptedConfig,
): unknown {
  const master = masterKey();
  if (!master) throw new Error("SAP credential storage is not configured.");

  const decipher = createDecipheriv(
    "aes-256-gcm",
    userKey(userId, master),
    Buffer.from(value.iv, "base64"),
  );
  decipher.setAAD(Buffer.from(`${AAD_PREFIX}${userId}`));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.encryptedConfig, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as unknown;
}

export async function getUserSapConfig(userId: string): Promise<unknown | null> {
  const { pool } = await import("@workspace/db");
  const result = await pool.query<EncryptedConfig>(
    `SELECT encrypted_config AS "encryptedConfig", iv, auth_tag AS "authTag"
     FROM sap_user_connections
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return decryptSapConfig(userId, row);
}

export async function saveUserSapConfig(
  userId: string,
  config: unknown,
): Promise<string> {
  const { pool } = await import("@workspace/db");
  const encrypted = encryptSapConfig(userId, config);
  const result = await pool.query<{ updatedAt: Date | string }>(
    `INSERT INTO sap_user_connections
       (user_id, encrypted_config, iv, auth_tag, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       encrypted_config = EXCLUDED.encrypted_config,
       iv = EXCLUDED.iv,
       auth_tag = EXCLUDED.auth_tag,
       updated_at = NOW()
     RETURNING updated_at AS "updatedAt"`,
    [userId, encrypted.encryptedConfig, encrypted.iv, encrypted.authTag],
  );
  const updatedAt = result.rows[0]?.updatedAt;
  return updatedAt instanceof Date
    ? updatedAt.toISOString()
    : new Date(updatedAt ?? Date.now()).toISOString();
}

export async function getUserSapConfigUpdatedAt(
  userId: string,
): Promise<string | null> {
  const { pool } = await import("@workspace/db");
  const result = await pool.query<{ updatedAt: Date | string }>(
    `SELECT updated_at AS "updatedAt"
     FROM sap_user_connections
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );
  const updatedAt = result.rows[0]?.updatedAt;
  if (!updatedAt) return null;
  return updatedAt instanceof Date
    ? updatedAt.toISOString()
    : new Date(updatedAt).toISOString();
}

export async function deleteUserSapConfig(userId: string): Promise<boolean> {
  const { pool } = await import("@workspace/db");
  const result = await pool.query(
    "DELETE FROM sap_user_connections WHERE user_id = $1",
    [userId],
  );
  return (result.rowCount ?? 0) > 0;
}
