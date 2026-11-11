import assert from "node:assert/strict";
import test from "node:test";
import { sourceMatchScope } from "./briefing-subject-match.ts";

test("matches a source that spells out the connector and between company-name words", () => {
  assert.equal(
    sourceMatchScope(
      {
        title: "OM Wire and Cable Industries announces new facility",
        snippet: "The report covers OM Wire and Cable Industries.",
      },
      "OM Wire Cable Industries",
      "company",
      null,
    ),
    "company",
  );
});

test("matches a strong brand mention without requiring every company-name word", () => {
  assert.equal(
    sourceMatchScope(
      {
        title: "Finolex outlines new capacity plans",
        snippet: "The company announced a manufacturing expansion.",
      },
      "Finolex Cables Ltd",
      "company",
      null,
    ),
    "company",
  );
});

test("ignores legal suffixes but rejects a conflicting company division", () => {
  assert.equal(
    sourceMatchScope(
      {
        title: "Finolex Cables Limited announces results",
        snippet: "Finolex Cables reported quarterly results.",
      },
      "Finolex Cables Ltd",
      "company",
      null,
    ),
    "company",
  );
  assert.equal(
    sourceMatchScope(
      {
        title: "New results from Finolex Industries",
        snippet: "Finolex Industries announced results.",
      },
      "Finolex Cables Ltd",
      "company",
      null,
    ),
    null,
  );
});

test("does not match a different company with the same leading name", () => {
  assert.equal(
    sourceMatchScope(
      {
        title: "OM Cables reports new orders",
        snippet: "OM Cables reported new orders.",
      },
      "OM Wire Cable Industries",
      "company",
      null,
    ),
    null,
  );
});

test("allows a close company-name match when one descriptive word is absent", () => {
  assert.equal(
    sourceMatchScope(
      {
        title: "OM Wire and Cable opens new plant",
        snippet: "The report covers OM Wire and Cable.",
      },
      "OM Wire Cable Industries",
      "company",
      null,
    ),
    "company",
  );
});

test("keeps person-affiliated company results labeled as company-level", () => {
  assert.equal(
    sourceMatchScope(
      {
        title: "OM Wire & Cable Industries announces new facility",
        snippet: "The report covers the company.",
      },
      "Asha Rao",
      "person",
      "OM Wire Cable Industries",
    ),
    "company",
  );
});
