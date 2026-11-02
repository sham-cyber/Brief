import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { pool } from "@workspace/db";

const ENCRYPTION_SECRET_NAME = "USER_CREDENTIALS_ENCRYPTION_KEY";
const USER_KEY_QUERY = `
  SELECT encrypted_key AS "encryptedKey",
         iv,
         auth_tag AS "authTag",
         updated_at AS "updatedAt"
  FROM tavily_user_credentials
  WHERE user_id = $1
`;

type EncryptedCredential = {
  encryptedKey: string;
  iv: string;
  authTag: string;
};

export class CredentialStorageUnavailableError extends Error {
  constructor() {
    super("Secure credential storage is unavailable.");
    this.name = "CredentialStorageUnavailableError";
  }
}

export class CredentialDecryptionError extends Error {
  constructor() {
    super("The saved Tavily credential could not be decrypted.");
    this.name = "CredentialDecryptionError";
  }
}

function encryptionKey(): Buffer {
  const raw = process.env[ENCRYPTION_SECRET_NAME]?.trim();
  if (!raw || !/^[a-fA-F0-9]{64}$/.test(raw)) {
    throw new CredentialStorageUnavailableError();
  }
  return Buffer.from(raw, "hex");
}

export function isCredentialStorageAvailable(): boolean {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

function encryptCredential(userId: string, apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`tavily:${userId}`, "utf8"));
  const encryptedKey = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final(),
  ]);
  return {
    encryptedKey: encryptedKey.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptCredential(userId: string, record: EncryptedCredential): string {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(record.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(`tavily:${userId}`, "utf8"));
    decipher.setAuthTag(Buffer.from(record.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(record.encryptedKey, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new CredentialDecryptionError();
  }
}

export async function getTavilyCredentialStatus(userId: string | null) {
  const storageReady = isCredentialStorageAvailable();
  if (!userId || !storageReady) {
    return { connected: false, storageReady, updatedAt: null as string | null };
  }

  const result = await pool.query<{ updatedAt: Date | string }>(
    USER_KEY_QUERY,
    [userId],
  );
  const updatedAt = result.rows[0]?.updatedAt;
  return {
    connected: Boolean(updatedAt),
    storageReady,
    updatedAt: updatedAt
      ? updatedAt instanceof Date
        ? updatedAt.toISOString()
        : new Date(updatedAt).toISOString()
      : null,
  };
}

export async function getUserTavilyApiKey(userId: string): Promise<string | null> {
  const result = await pool.query<EncryptedCredential>(USER_KEY_QUERY, [userId]);
  const record = result.rows[0];
  if (!record) return null;
  return decryptCredential(userId, record);
}

export async function saveUserTavilyApiKey(
  userId: string,
  apiKey: string,
): Promise<void> {
  const encrypted = encryptCredential(userId, apiKey);
  await pool.query(
    `INSERT INTO tavily_user_credentials (
       user_id, encrypted_key, iv, auth_tag, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       encrypted_key = EXCLUDED.encrypted_key,
       iv = EXCLUDED.iv,
       auth_tag = EXCLUDED.auth_tag,
       updated_at = NOW()`,
    [userId, encrypted.encryptedKey, encrypted.iv, encrypted.authTag],
  );
}

export async function deleteUserTavilyApiKey(userId: string): Promise<void> {
  await pool.query(
    "DELETE FROM tavily_user_credentials WHERE user_id = $1",
    [userId],
  );
}

