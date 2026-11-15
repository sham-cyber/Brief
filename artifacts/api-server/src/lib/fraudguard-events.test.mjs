import assert from "node:assert/strict";
import test from "node:test";
import { FraudGuardEventSender } from "./fraudguard-events.ts";

const config = {
  enabled: true,
  apiUrl: "http://127.0.0.1:8787/api/v2/events",
  clientKey: "fg_test_key_that_is_long_enough_12345",
  profileHmacKey: "profile-hmac-test-secret-with-at-least-32-characters",
};

test("FraudGuard delivery stays disabled unless explicitly enabled", () => {
  let requests = 0;
  const sender = new FraudGuardEventSender(
    { ...config, enabled: false },
    async () => {
      requests += 1;
      return new Response(null, { status: 202 });
    },
  );

  assert.equal(sender.status().enabled, false);
  assert.equal(sender.enqueue({
    userId: "account-1",
    attemptId: "attempt-1",
    operation: "model_summary",
    eventType: "start",
    status: "started",
    provider: "ollama",
    model: "qwen3:0.6b",
  }), false);
  assert.equal(requests, 0);
});

test("production delivery rejects insecure non-HTTPS and loopback endpoints", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const sender = new FraudGuardEventSender({
      ...config,
      apiUrl: "http://127.0.0.1:8787/api/v2/events",
    });
    assert.equal(sender.status().enabled, false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("sender emits only minimized fields and pseudonymizes account identity", async () => {
  let requestUrl = "";
  let requestOptions;
  const sender = new FraudGuardEventSender(config, async (url, options) => {
    requestUrl = String(url);
    requestOptions = options;
    return new Response(null, { status: 202 });
  });

  sender.enqueue({
    userId: "account-private@example.com",
    attemptId: "attempt-safe-01",
    operation: "tavily_search",
    eventType: "completion",
    status: "completed",
    provider: "ignored-provider",
    durationMs: 315,
    resultCount: 3,
    query: "private search phrase",
    url: "https://private.example/source",
  });
  await sender.waitForIdle();

  const body = JSON.parse(requestOptions.body);
  assert.equal(requestUrl, config.apiUrl);
  assert.equal(requestOptions.method, "POST");
  assert.equal(requestOptions.headers.authorization, `Bearer ${config.clientKey}`);
  assert.equal(body.provider, "tavily");
  assert.equal(body.operation, "tavily_search");
  assert.equal(body.event_type, "completion");
  assert.equal(body.duration_ms, 315);
  assert.equal(body.result_count, 3);
  assert.match(body.profile_ref, /^[a-f0-9]{40}$/);
  assert.notEqual(body.profile_ref, "account-private@example.com");
  assert.equal("model" in body, false);
  assert.equal("userId" in body, false);
  assert.equal("query" in body, false);
  assert.equal("url" in body, false);
  assert.doesNotMatch(requestOptions.body, /account-private|private search phrase|private\.example/);
  assert.deepEqual(sender.status(), {
    enabled: true,
    pendingEvents: 0,
    droppedEvents: 0,
  });
});

test("bounded queue reports events dropped when it is full", async () => {
  let resolveFetch;
  const sender = new FraudGuardEventSender(
    { ...config, queueCapacity: 1 },
    () => new Promise((resolve) => {
      resolveFetch = resolve;
    }),
  );
  const event = {
    userId: "account-1",
    attemptId: "attempt-1",
    operation: "model_summary",
    eventType: "start",
    status: "started",
    provider: "ollama",
    model: "qwen3:0.6b",
  };

  assert.equal(sender.enqueue(event), true);
  assert.equal(sender.enqueue({ ...event, attemptId: "attempt-2" }), false);
  assert.equal(sender.status().droppedEvents, 1);
  resolveFetch(new Response(null, { status: 202 }));
  await sender.waitForIdle();
  assert.equal(sender.status().pendingEvents, 0);
  assert.equal(sender.status().droppedEvents, 1);
});

test("non-success receiver responses are counted as dropped", async () => {
  const sender = new FraudGuardEventSender(config, async () =>
    new Response(null, { status: 503 })
  );

  sender.enqueue({
    userId: "account-1",
    attemptId: "attempt-1",
    operation: "model_summary",
    eventType: "failure",
    status: "failed",
    provider: "ollama",
    model: "qwen3:0.6b",
    durationMs: 12,
  });
  await sender.waitForIdle();
  assert.equal(sender.status().droppedEvents, 1);
});
