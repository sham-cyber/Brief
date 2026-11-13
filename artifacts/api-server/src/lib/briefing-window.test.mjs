import assert from "node:assert/strict";
import test from "node:test";
import { resolveBriefingWindow } from "./briefing-window.ts";

test("defaults to a rolling 30-day window when dates are omitted", () => {
  const now = new Date("2026-11-13T12:00:00.000Z");
  const result = resolveBriefingWindow(undefined, undefined, now);
  assert.equal(result.windowStart.toISOString(), "2026-10-14T12:00:00.000Z");
  assert.equal(result.windowEnd.toISOString(), now.toISOString());
});

test("uses the selected inclusive calendar dates", () => {
  const now = new Date("2026-11-13T12:00:00.000Z");
  const result = resolveBriefingWindow("2026-10-14", "2026-11-13", now);
  assert.equal(result.windowStart.toISOString(), "2026-10-14T00:00:00.000Z");
  assert.equal(result.windowEnd.toISOString(), now.toISOString());
});

test("rejects a reversed date range", () => {
  assert.throws(
    () => resolveBriefingWindow("2026-11-14", "2026-11-13", new Date("2026-11-13T12:00:00.000Z")),
    /start date must be on or before/,
  );
});

test("rejects dates after today in Asia/Kolkata", () => {
  assert.throws(
    () => resolveBriefingWindow("2026-11-13", "2026-11-14", new Date("2026-11-13T18:00:00.000Z")),
    /cannot be in the future/,
  );
});

test("rejects impossible calendar dates", () => {
  assert.throws(
    () => resolveBriefingWindow("2026-02-30", "2026-03-01", new Date("2026-03-01T12:00:00.000Z")),
    /valid research dates/,
  );
});
