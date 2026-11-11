import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOllamaConfig } from "./ollama-config.ts";

test("account Ollama config accepts local development endpoints", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    const config = normalizeOllamaConfig({
      baseUrl: "http://127.0.0.1:11434/",
      model: "qwen3:0.6b",
    });
    assert.equal(config.baseUrl, "http://127.0.0.1:11434");
    assert.equal(config.model, "qwen3:0.6b");
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("account Ollama config requires a protected HTTPS remote endpoint", () => {
  assert.throws(
    () => normalizeOllamaConfig({ baseUrl: "http://ollama.example", model: "qwen3:0.6b" }),
    /HTTPS/,
  );
  assert.throws(
    () => normalizeOllamaConfig({ baseUrl: "https://ollama.example", model: "qwen3:0.6b" }),
    /bearer token/,
  );
  assert.equal(
    normalizeOllamaConfig({
      baseUrl: "https://ollama.example",
      model: "qwen3:0.6b",
      authToken: "secret-token",
    }).baseUrl,
    "https://ollama.example",
  );
});

test("account Ollama config rejects address literals and URL credentials", () => {
  assert.throws(
    () => normalizeOllamaConfig({
      baseUrl: "https://8.8.8.8",
      model: "qwen3:0.6b",
      authToken: "token",
    }),
    /public DNS hostname/,
  );
  assert.throws(
    () => normalizeOllamaConfig({
      baseUrl: "https://user:pass@ollama.example",
      model: "qwen3:0.6b",
      authToken: "token",
    }),
    /credentials/,
  );
});
