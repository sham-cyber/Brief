import assert from "node:assert/strict";
import test from "node:test";
import { getAiProviderStatus } from "./ai-provider.ts";

const environmentKeys = [
  "OLLAMA_HOST",
  "OLLAMA_MODEL",
  "OLLAMA_AUTH_TOKEN",
  "OLLAMA_CLOUDFLARE_ACCESS_CLIENT_ID",
  "OLLAMA_CLOUDFLARE_ACCESS_CLIENT_SECRET",
  "NODE_ENV",
];

async function withEnvironment(values, run) {
  const previous = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
  );
  for (const key of environmentKeys) {
    if (Object.hasOwn(values, key)) process.env[key] = values[key];
    else delete process.env[key];
  }
  try {
    await run();
  } finally {
    for (const key of environmentKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("Ollama stays offline until its local host and model are configured", async () => {
  await withEnvironment({}, async () => {
    let requests = 0;
    const status = await getAiProviderStatus(async () => {
      requests += 1;
      throw new Error("No provider should be called");
    });

    assert.equal(status.provider, "ollama");
    assert.equal(status.connected, false);
    assert.match(status.message, /Set a valid OLLAMA_HOST and OLLAMA_MODEL/);
    assert.equal(status.providerEndpoint, null);
    assert.equal(requests, 0);
  });
});

test("Ollama readiness requires the configured model to be installed", async () => {
  await withEnvironment({
    OLLAMA_HOST: "https://ollama.example",
    OLLAMA_MODEL: "qwen2.5:3b",
    OLLAMA_AUTH_TOKEN: "test-token",
    NODE_ENV: "development",
  }, async () => {
    let requestedUrl = "";
    let authorization = "";
    const status = await getAiProviderStatus(async (url, options) => {
      requestedUrl = String(url);
      authorization = options.headers.authorization;
      return new Response(JSON.stringify({
        models: [{ name: "qwen2.5:3b" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    assert.equal(requestedUrl, "https://ollama.example/api/tags");
    assert.equal(authorization, "Bearer test-token");
    assert.equal(status.provider, "ollama");
    assert.equal(status.connected, true);
    assert.equal(status.model, "qwen2.5:3b");
    assert.equal(status.providerEndpoint, "https://ollama.example");
  });
});

test("Ollama readiness reports a missing configured model", async () => {
  await withEnvironment({
    OLLAMA_HOST: "https://ollama.example",
    OLLAMA_MODEL: "qwen2.5:3b",
    NODE_ENV: "development",
  }, async () => {
    const status = await getAiProviderStatus(async () =>
      new Response(JSON.stringify({ models: [{ name: "llama3.2:latest" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    assert.equal(status.connected, false);
    assert.equal(status.providerEndpoint, "https://ollama.example");
    assert.match(status.message, /model is not installed/);
  });
});

test("Ollama readiness fails closed when the server cannot be reached", async () => {
  await withEnvironment({
    OLLAMA_HOST: "https://ollama.example",
    OLLAMA_MODEL: "qwen2.5:3b",
    NODE_ENV: "development",
  }, async () => {
    const status = await getAiProviderStatus(async () => {
      throw new Error("connection refused");
    });

    assert.equal(status.connected, false);
    assert.equal(status.providerEndpoint, "https://ollama.example");
    assert.match(status.message, /could not be reached/);
  });
});

test("production Ollama hosts must use HTTPS", async () => {
  await withEnvironment({
    OLLAMA_HOST: "http://ollama.example",
    OLLAMA_MODEL: "qwen2.5:3b",
    NODE_ENV: "production",
  }, async () => {
    let requests = 0;
    const status = await getAiProviderStatus(async () => {
      requests += 1;
      throw new Error("An insecure host must not be contacted");
    });

    assert.equal(status.connected, false);
    assert.equal(requests, 0);
    assert.match(status.message, /OLLAMA_AUTH_TOKEN/);
  });
});

test("production Ollama status requires a protected HTTPS host", async () => {
  await withEnvironment({
    OLLAMA_HOST: "https://ollama.example",
    OLLAMA_MODEL: "qwen2.5:3b",
    OLLAMA_AUTH_TOKEN: "test-token",
    NODE_ENV: "production",
  }, async () => {
    const status = await getAiProviderStatus(async (_url, options) => {
      assert.equal(options.headers.authorization, "Bearer test-token");
      return new Response(JSON.stringify({
        models: [{ name: "qwen2.5:3b" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    assert.equal(status.connected, true);
    assert.equal(status.providerEndpoint, "https://ollama.example");
  });
});

test("production Ollama can authenticate with Cloudflare Access service tokens", async () => {
  await withEnvironment({
    OLLAMA_HOST: "https://ollama.example",
    OLLAMA_MODEL: "qwen2.5:3b",
    OLLAMA_CLOUDFLARE_ACCESS_CLIENT_ID: "test-client-id",
    OLLAMA_CLOUDFLARE_ACCESS_CLIENT_SECRET: "test-client-secret",
    NODE_ENV: "production",
  }, async () => {
    const status = await getAiProviderStatus(async (_url, options) => {
      assert.equal(options.headers["CF-Access-Client-Id"], "test-client-id");
      assert.equal(
        options.headers["CF-Access-Client-Secret"],
        "test-client-secret",
      );
      assert.equal(options.headers.authorization, undefined);
      return new Response(JSON.stringify({
        models: [{ name: "qwen2.5:3b" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    assert.equal(status.connected, true);
    assert.equal(status.providerEndpoint, "https://ollama.example");
  });
});

test("partial Cloudflare Access credentials fail closed", async () => {
  await withEnvironment({
    OLLAMA_HOST: "https://ollama.example",
    OLLAMA_MODEL: "qwen2.5:3b",
    OLLAMA_CLOUDFLARE_ACCESS_CLIENT_ID: "test-client-id",
    NODE_ENV: "production",
  }, async () => {
    let requests = 0;
    const status = await getAiProviderStatus(async () => {
      requests += 1;
      throw new Error("An incomplete service token must not be used");
    });

    assert.equal(status.connected, false);
    assert.equal(status.providerEndpoint, null);
    assert.equal(requests, 0);
  });
});

test("bearer auth works when a Cloudflare client ID is left without its secret", async () => {
  await withEnvironment({
    OLLAMA_HOST: "https://ollama.example",
    OLLAMA_MODEL: "qwen2.5:3b",
    OLLAMA_AUTH_TOKEN: "ngrok-policy-token",
    OLLAMA_CLOUDFLARE_ACCESS_CLIENT_ID: "leftover-client-id",
    NODE_ENV: "production",
  }, async () => {
    const status = await getAiProviderStatus(async (_url, options) => {
      assert.equal(options.headers.authorization, "Bearer ngrok-policy-token");
      assert.equal(options.headers["CF-Access-Client-Id"], undefined);
      return new Response(JSON.stringify({
        models: [{ name: "qwen2.5:3b" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    assert.equal(status.connected, true);
  });
});

test("a local clone may use its loopback Ollama server in production mode", async () => {
  await withEnvironment({
    OLLAMA_HOST: "http://127.0.0.1:11434",
    OLLAMA_MODEL: "qwen2.5:3b",
    NODE_ENV: "production",
  }, async () => {
    const status = await getAiProviderStatus(async (url, options) => {
      assert.equal(String(url), "http://127.0.0.1:11434/api/tags");
      assert.equal(options.headers.authorization, undefined);
      return new Response(JSON.stringify({
        models: [{ name: "qwen2.5:3b" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    assert.equal(status.connected, true);
    assert.equal(status.providerEndpoint, "http://127.0.0.1:11434");
  });
});
