import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { pool } from "@workspace/db";
import {
  normalizeOllamaConfig,
  type UserOllamaConfig,
} from "./ollama-config.ts";

const CONFIG_QUERY = `
  SELECT encrypted_config AS "encryptedConfig", iv, auth_tag AS "authTag"
  FROM ollama_user_connections
  WHERE user_id = $1
`;

function encryptionKey(): Buffer {
  const raw = process.env.USER_CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!raw || !/^[a-fA-F0-9]{64}$/.test(raw)) {
    throw new Error("Secure Ollama settings storage is unavailable.");
  }
  return Buffer.from(raw, "hex");
}

function encryptConfig(userId: string, config: UserOllamaConfig) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`ollama:${userId}`, "utf8"));
  const encryptedConfig = Buffer.concat([
    cipher.update(JSON.stringify(config), "utf8"),
    cipher.final(),
  ]);
  return {
    encryptedConfig: encryptedConfig.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptConfig(
  userId: string,
  record: { encryptedConfig: string; iv: string; authTag: string },
): UserOllamaConfig {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(record.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(`ollama:${userId}`, "utf8"));
    decipher.setAuthTag(Buffer.from(record.authTag, "base64"));
    const raw = Buffer.concat([
      decipher.update(Buffer.from(record.encryptedConfig, "base64")),
      decipher.final(),
    ]).toString("utf8");
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("baseUrl" in parsed) ||
      !("model" in parsed) ||
      typeof parsed.baseUrl !== "string" ||
      typeof parsed.model !== "string"
    ) {
      throw new Error("Invalid encrypted configuration.");
    }
    return parsed as UserOllamaConfig;
  } catch {
    throw new Error("The saved Ollama connection could not be decrypted.");
  }
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224;
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fc") ||
      normalized.startsWith("fd") || normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") || normalized.startsWith("fea") ||
      normalized.startsWith("feb")) return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isIP(mapped) === 4 ? isPrivateIpv4(mapped) : true;
  }
  return false;
}

export async function getUserOllamaConfig(userId: string): Promise<UserOllamaConfig | null> {
  const result = await pool.query<{
    encryptedConfig: string;
    iv: string;
    authTag: string;
  }>(CONFIG_QUERY, [userId]);
  const record = result.rows[0];
  if (!record) return null;
  const config = decryptConfig(userId, record);
  const normalized = normalizeOllamaConfig(config);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(normalized.baseUrl).hostname.toLowerCase())) {
    const hostname = new URL(normalized.baseUrl).hostname;
    const resolved = await lookup(hostname, { all: true, verbatim: true });
    if (!resolved.length || resolved.some(({ address }) => isPrivateAddress(address))) {
      throw new Error("The remote Ollama endpoint resolves to a private or reserved network address.");
    }
  }
  return normalized;
}

export async function saveUserOllamaConfig(
  userId: string,
  rawConfig: { baseUrl: string; model: string; authToken?: string },
): Promise<void> {
  const config = normalizeOllamaConfig(rawConfig);
  const encrypted = encryptConfig(userId, config);
  await pool.query(
    `INSERT INTO ollama_user_connections
       (user_id, encrypted_config, iv, auth_tag, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id) DO UPDATE
     SET encrypted_config = EXCLUDED.encrypted_config,
         iv = EXCLUDED.iv,
         auth_tag = EXCLUDED.auth_tag,
         updated_at = NOW()`,
    [userId, encrypted.encryptedConfig, encrypted.iv, encrypted.authTag],
  );
}

export async function deleteUserOllamaConfig(userId: string): Promise<void> {
  await pool.query("DELETE FROM ollama_user_connections WHERE user_id = $1", [userId]);
}
