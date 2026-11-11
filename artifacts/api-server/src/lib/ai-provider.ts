export type AiProvider = "ollama";

export type OllamaProviderConfig = {
  provider: "ollama";
  baseUrl: string;
  model: string;
  authToken?: string;
  cloudflareAccessClientId?: string;
  cloudflareAccessClientSecret?: string;
};

export type AiProviderConfig = OllamaProviderConfig;

export type AiProviderStatus = {
  provider: AiProvider;
  connected: boolean;
  model: string | null;
  providerEndpoint: string | null;
  message: string | null;
};

const OLLAMA_STATUS_TIMEOUT_MS = 3_000;

function getOllamaServerConfig(): OllamaProviderConfig | null {
  const rawHost = process.env.OLLAMA_HOST?.trim();
  const model = process.env.OLLAMA_MODEL?.trim();
  const authToken = process.env.OLLAMA_AUTH_TOKEN?.trim() || undefined;
  const cloudflareAccessClientId =
    process.env.OLLAMA_CLOUDFLARE_ACCESS_CLIENT_ID?.trim() || undefined;
  const cloudflareAccessClientSecret =
    process.env.OLLAMA_CLOUDFLARE_ACCESS_CLIENT_SECRET?.trim() || undefined;
  if (!rawHost || !model) return null;
  const hasPartialCloudflareCredentials =
    Boolean(cloudflareAccessClientId) !== Boolean(cloudflareAccessClientSecret);
  if (hasPartialCloudflareCredentials && !authToken) {
    return null;
  }

  try {
    const url = new URL(rawHost);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(
      url.hostname.toLowerCase(),
    );
    const hasProtectedRemoteAuth = Boolean(authToken) ||
      Boolean(cloudflareAccessClientId && cloudflareAccessClientSecret);
    if (
      process.env.NODE_ENV === "production" &&
      !localHost &&
      (url.protocol !== "https:" || !hasProtectedRemoteAuth)
    ) {
      return null;
    }
    return {
      provider: "ollama",
      baseUrl: url.href.replace(/\/+$/, ""),
      model,
      authToken,
      cloudflareAccessClientId,
      cloudflareAccessClientSecret,
    };
  } catch {
    return null;
  }
}

export async function getAiProviderConfig(
  userId?: string,
): Promise<AiProviderConfig | null> {
  if (userId) {
    const { getUserOllamaConfig } = await import("./user-ollama-credentials.ts");
    return getUserOllamaConfig(userId);
  }
  return getOllamaServerConfig();
}

export function getOllamaRequestHeaders(
  config: OllamaProviderConfig,
): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(config.authToken
      ? { authorization: `Bearer ${config.authToken}` }
      : {}),
    ...(config.cloudflareAccessClientId && config.cloudflareAccessClientSecret
      ? {
          "CF-Access-Client-Id": config.cloudflareAccessClientId,
          "CF-Access-Client-Secret": config.cloudflareAccessClientSecret,
        }
      : {}),
  };
}

function ollamaUrl(config: OllamaProviderConfig, endpoint: string): string {
  return new URL(endpoint, `${config.baseUrl}/`).toString();
}

function normalizedModelName(name: string): string {
  return name.endsWith(":latest") ? name.slice(0, -":latest".length) : name;
}

export async function getAiProviderStatus(
  fetcher: typeof fetch = fetch,
): Promise<AiProviderStatus> {
  const config = getOllamaServerConfig();
  if (!config) {
    return {
      provider: "ollama",
      connected: false,
      model: process.env.OLLAMA_MODEL?.trim() || null,
      providerEndpoint: null,
      message:
        "Set a valid OLLAMA_HOST and OLLAMA_MODEL. Local loopback may use HTTP; a remote production host requires HTTPS and OLLAMA_AUTH_TOKEN or both Cloudflare Access service-token credentials.",
    };
  }
  return getAiProviderStatusForConfig(config, fetcher);
}

export async function getAiProviderStatusForUser(
  userId: string,
  fetcher: typeof fetch = fetch,
): Promise<AiProviderStatus> {
  try {
    const { getUserOllamaConfig } = await import("./user-ollama-credentials.ts");
    return await getAiProviderStatusForConfig(
      await getUserOllamaConfig(userId),
      fetcher,
    );
  } catch {
    return {
      provider: "ollama",
      connected: false,
      model: null,
      providerEndpoint: null,
      message: "The saved Ollama connection is invalid or unavailable.",
    };
  }
}

async function getAiProviderStatusForConfig(
  config: OllamaProviderConfig | null,
  fetcher: typeof fetch,
): Promise<AiProviderStatus> {
  if (!config) {
    return {
      provider: "ollama",
      connected: false,
      model: null,
      providerEndpoint: null,
      message:
        "Set and save your Ollama endpoint and model in your account settings.",
    };
  }

  try {
    const response = await fetcher(ollamaUrl(config, "api/tags"), {
      method: "GET",
      headers: getOllamaRequestHeaders(config),
      signal: AbortSignal.timeout(OLLAMA_STATUS_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        provider: "ollama",
        connected: false,
        model: config.model,
        providerEndpoint: config.baseUrl,
        message: "The configured Ollama server did not respond successfully.",
      };
    }

    const payload: unknown = await response.json();
    const models =
      payload && typeof payload === "object" && "models" in payload &&
      Array.isArray(payload.models)
        ? payload.models
        : [];
    const requestedModel = normalizedModelName(config.model);
    const modelAvailable = models.some((entry) => {
      if (!entry || typeof entry !== "object" || !("name" in entry)) {
        return false;
      }
      return typeof entry.name === "string" &&
        normalizedModelName(entry.name) === requestedModel;
    });

    return {
      provider: "ollama",
      connected: modelAvailable,
      model: config.model,
      providerEndpoint: config.baseUrl,
      message: modelAvailable
        ? null
        : "Ollama is reachable, but the configured model is not installed.",
    };
  } catch {
    return {
      provider: "ollama",
      connected: false,
      model: config.model,
      providerEndpoint: config.baseUrl,
      message: "The configured Ollama server could not be reached.",
    };
  }
}
