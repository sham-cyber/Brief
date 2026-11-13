import assert from "node:assert/strict";
import test from "node:test";
import { getTavilyIncludeDomains } from "./tavily-topic-domains.ts";

test("each briefing topic has a restricted domain list", () => {
  for (const topic of ["news", "hire", "launch", "financial", "risk"]) {
    const domains = getTavilyIncludeDomains(topic);
    assert.ok(domains.length > 0, `${topic} should have domains`);
    assert.equal(new Set(domains).size, domains.length, `${topic} should not repeat domains`);
    assert.ok(
      domains.every((domain) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)),
      `${topic} domains should be hostnames without URL paths`,
    );
  }
});

test("News uses established news sources", () => {
  const domains = getTavilyIncludeDomains("news");
  assert.ok(domains.includes("reuters.com"));
  assert.ok(domains.includes("apnews.com"));
  assert.ok(domains.includes("business-standard.com"));
});

test("Hires prioritizes LinkedIn and Indian job boards", () => {
  const domains = getTavilyIncludeDomains("hire");
  assert.ok(domains.includes("linkedin.com"));
  assert.ok(domains.includes("naukri.com"));
  assert.ok(domains.includes("indeed.com"));
});

test("callers cannot mutate the shared topic domain lists", () => {
  const domains = getTavilyIncludeDomains("news");
  domains.push("untrusted.example");
  assert.ok(!getTavilyIncludeDomains("news").includes("untrusted.example"));
});
