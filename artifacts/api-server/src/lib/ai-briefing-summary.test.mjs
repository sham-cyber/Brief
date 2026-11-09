import assert from "node:assert/strict";
import test from "node:test";
import { validateAiTopicResponse } from "./ai-briefing-summary.ts";

test("AI summaries keep only citations from the matching topic evidence", () => {
  const result = validateAiTopicResponse(
    JSON.stringify({
      summary: "The company announced a new product line.",
      sourceIds: ["source-1", "invented-source"],
    }),
    "launch",
    ["source-1"],
  );

  assert.deepEqual(result, {
    category: "launch",
    summary: "The company announced a new product line.",
    sourceIds: ["source-1"],
  });
});

test("AI summaries are capped at 50 words", () => {
  const longSummary = Array.from({ length: 65 }, (_, index) => `word${index}`).join(" ");
  const result = validateAiTopicResponse(
    JSON.stringify({ summary: longSummary, sourceIds: ["source-1"] }),
    "news",
    ["source-1"],
  );

  assert.equal(result.summary.split(/\s+/).length, 50);
  assert.ok(result.summary.endsWith("…"));
});

test("AI summaries without a valid source citation are rejected", () => {
  assert.throws(
    () => validateAiTopicResponse(
      JSON.stringify({ summary: "An unsupported claim.", sourceIds: ["unknown"] }),
      "financial",
      ["source-1"],
    ),
    /supported citation/,
  );
});
