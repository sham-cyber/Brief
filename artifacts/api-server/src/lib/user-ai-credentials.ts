import { pool } from "@workspace/db";
import {
  decryptUserAiKey,
  encryptUserAiKey,
  isAiCredentialEncryptionAvailable,
} from "./ai-credential-crypto";

const SELECT_CREDENTIAL = `
  SELECT encrypted_key AS "encryptedKey",
         iv,
         auth_tag AS "authTag",
         model,
         updated_at AS "updatedAt"
  FROM ai_user_credentials
  WHERE user_id = $1
`;

type EncryptedAiCredential = {
  encryptedKey: string;
  iv: string;
  authTag: string;
  model: string;
  updatedAt: Date | string;
};

export function isAiCredentialStorageAvailable(): boolean {
  return isAiCredentialEncryptionAvailable();
}

export async function getAiCredentialStatus(userId: string) {
  const storageReady = isAiCredentialStorageAvailable();
  const result = await pool.query<{ model: string; updatedAt: Date | string }>(
    SELECT_CREDENTIAL,
    [userId],
  );
  const row = result.rows[0];
  const updatedAt = row?.updatedAt;
  return {
    connected: Boolean(row),
    storageReady,
    model: row?.model ?? null,
    updatedAt: updatedAt
      ? updatedAt instanceof Date
        ? updatedAt.toISOString()
        : new Date(updatedAt).toISOString()
      : null,
  };
}

export async function getUserAiConfig(userId: string): Promise<{
  apiKey: string;
  model: string;
} | null> {
  const result = await pool.query<EncryptedAiCredential>(
    SELECT_CREDENTIAL,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { apiKey: decryptUserAiKey(userId, row), model: row.model };
}

export async function saveUserAiConfig(
  userId: string,
  apiKey: string,
  model: string,
): Promise<void> {
  const encrypted = encryptUserAiKey(userId, apiKey);
  await pool.query(
    `INSERT INTO ai_user_credentials (
       user_id, encrypted_key, iv, auth_tag, model, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       encrypted_key = EXCLUDED.encrypted_key,
       iv = EXCLUDED.iv,
       auth_tag = EXCLUDED.auth_tag,
       model = EXCLUDED.model,
       updated_at = NOW()`,
    [userId, encrypted.encryptedKey, encrypted.iv, encrypted.authTag, model],
  );
}

export async function deleteUserAiConfig(userId: string): Promise<void> {
  await pool.query("DELETE FROM ai_user_credentials WHERE user_id = $1", [
    userId,
  ]);
}
