import assert from "node:assert/strict";
import test from "node:test";
import { searchTavily } from "./tavily.ts";
import { getTavilyIncludeDomains } from "./tavily-topic-domains.ts";

test("sends topic domains as a restrictive Tavily include_domains filter", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ results: [], usage: { credits: 1 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await searchTavily(
      "company hiring roles",
      "2026-10-14",
      "2026-11-13",
      "test-key",
      { includeDomains: getTavilyIncludeDomains("hire") },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestBody.include_domains, getTavilyIncludeDomains("hire"));
  assert.equal(requestBody.include_domains_mode, "restrict");
});
