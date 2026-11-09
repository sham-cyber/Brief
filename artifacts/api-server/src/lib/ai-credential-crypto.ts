import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class AiCredentialStorageUnavailableError extends Error {
  constructor() {
    super("Secure AI credential storage is unavailable.");
    this.name = "AiCredentialStorageUnavailableError";
  }
}

export class AiCredentialDecryptionError extends Error {
  constructor() {
    super("The saved AI credential could not be decrypted.");
    this.name = "AiCredentialDecryptionError";
  }
}

function encryptionKey(): Buffer {
  const raw = process.env.USER_CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!raw || !/^[a-fA-F0-9]{64}$/.test(raw)) {
    throw new AiCredentialStorageUnavailableError();
  }
  return Buffer.from(raw, "hex");
}

export function isAiCredentialEncryptionAvailable(): boolean {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptUserAiKey(userId: string, apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`openai:${userId}`, "utf8"));
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

export function decryptUserAiKey(
  userId: string,
  row: { encryptedKey: string; iv: string; authTag: string },
): string {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(row.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(`openai:${userId}`, "utf8"));
    decipher.setAuthTag(Buffer.from(row.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(row.encryptedKey, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AiCredentialDecryptionError();
  }
}
