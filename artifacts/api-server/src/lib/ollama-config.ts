import { isIP } from "node:net";

export type UserOllamaConfig = {
  provider: "ollama";
  baseUrl: string;
  model: string;
  authToken?: string;
};

export function normalizeOllamaConfig(input: {
  baseUrl: string;
  model: string;
  authToken?: string;
}): UserOllamaConfig {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  const model = input.model.trim();
  const authToken = input.authToken?.trim() || undefined;
  if (!model || model.length > 120 || /[\r\n]/.test(model)) {
    throw new Error("Enter a valid Ollama model name.");
  }
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Enter a valid Ollama endpoint URL.");
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Use a base URL only; credentials, query strings, and paths are not allowed.");
  }
  const hostname = url.hostname.toLowerCase();
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  if (loopback) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Loopback Ollama is allowed only when running a local development clone.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Use HTTP or HTTPS for the local Ollama connection.");
    }
  } else {
    if (url.protocol !== "https:") {
      throw new Error("Remote Ollama-compatible endpoints must use HTTPS.");
    }
    if (!authToken) {
      throw new Error("Add a bearer token for a remote Ollama-compatible endpoint.");
    }
    if (isIP(hostname) || hostname === "localhost" || hostname.endsWith(".localhost") ||
        hostname.endsWith(".local") || hostname.endsWith(".internal")) {
      throw new Error("Remote Ollama endpoint must use a public DNS hostname.");
    }
  }
  return {
    provider: "ollama",
    baseUrl: url.href.replace(/\/+$/, ""),
    model,
    authToken,
  };
}
