import assert from "node:assert/strict";
import test from "node:test";
import { appendQuestionToSearchQuery } from "./briefing-question.ts";

test("adds a direct question to the existing topic query", () => {
  assert.equal(
    appendQuestionToSearchQuery(
      "Finolex Cables recent news coverage",
      "What changed in the last 30 days?",
    ),
    "Finolex Cables recent news coverage What changed in the last 30 days?",
  );
});

test("leaves the topic query unchanged for an empty question", () => {
  assert.equal(appendQuestionToSearchQuery("Example topic query", "  \n "), "Example topic query");
});

test("normalizes line breaks and bounds the appended question", () => {
  const question = `What "changed"\n${"recent ".repeat(60)}`;
  const query = appendQuestionToSearchQuery("Example topic query", question);
  assert.ok(query.startsWith("Example topic query What changed"));
  assert.ok(query.length <= "Example topic query ".length + 240);
});
