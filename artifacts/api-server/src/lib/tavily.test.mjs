import assert from "node:assert/strict";
import test from "node:test";
import { searchTavily } from "./tavily.ts";

test("Tavily sends only lifecycle, timing, count, and safe validation metadata", async () => {
  const events = [];
  const result = await searchTavily(
    "private company query",
    "2026-11-01",
    "2026-11-15",
    "tavily-secret",
    undefined,
    {},
    {
      userId: "private-account-id",
      emitter: (event) => events.push(event),
    },
    async (_url, options) => {
      assert.match(options.headers.Authorization, /tavily-secret/);
      return new Response(JSON.stringify({
        results: [{
          title: "Private source title",
          url: "https://private.example/source",
          content: "Private source text",
        }],
        usage: { credits: 1 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  );

  assert.equal(result.results.length, 1);
  assert.equal(result.creditsUsed, 1);
  assert.deepEqual(events.map((event) => [event.eventType, event.status]), [
    ["start", "started"],
    ["completion", "completed"],
    ["citation_guardrail", "passed"],
  ]);
  assert.equal(events[1].durationMs >= 0, true);
  assert.equal(events[1].resultCount, 1);
  assert.equal(events[2].validationOutcome, "passed");
  assert.ok(events.every((event) => event.operation === "tavily_search"));
  const telemetry = JSON.stringify(events);
  assert.doesNotMatch(
    telemetry,
    /private company query|private\.example|Private source text|tavily-secret/,
  );
});

test("Tavily failures emit failure and not-run validation metadata", async () => {
  const events = [];
  await assert.rejects(() => searchTavily(
    "private query",
    "",
    "",
    "tavily-secret",
    undefined,
    {},
    {
      userId: "private-account-id",
      emitter: (event) => events.push(event),
    },
    async () => new Response(null, { status: 503 }),
  ));

  assert.deepEqual(events.map((event) => [event.eventType, event.status]), [
    ["start", "started"],
    ["failure", "failed"],
    ["citation_guardrail", "not_run"],
  ]);
});

test("malformed Tavily response records a failed safe validation outcome", async () => {
  const events = [];
  await assert.rejects(() => searchTavily(
    "private query",
    "",
    "",
    "tavily-secret",
    undefined,
    {},
    {
      userId: "private-account-id",
      emitter: (event) => events.push(event),
    },
    async () => new Response(JSON.stringify({ results: "invalid" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ));

  assert.deepEqual(events.map((event) => [event.eventType, event.status]), [
    ["start", "started"],
    ["failure", "failed"],
    ["citation_guardrail", "failed"],
  ]);
});
