import assert from "node:assert/strict";
import test from "node:test";
import {
  assessAccessWindow,
  getKolkataDate,
  getMaxAccessWindowEnd,
  validateAccessWindow,
} from "./briefing-access-window.ts";

test("allows the selected dates inclusively in Asia/Kolkata", () => {
  const window = assessAccessWindow(
    "2026-11-12",
    "2026-11-30",
    new Date("2026-11-30T18:29:59.000Z"),
  );
  assert.equal(window.state, "active");
  assert.equal(window.active, true);
  assert.equal(window.expiresAt?.toISOString(), "2026-11-30T18:30:00.000Z");
});

test("marks the window expired immediately after the final IST day", () => {
  const window = assessAccessWindow(
    "2026-11-12",
    "2026-11-30",
    new Date("2026-11-30T18:30:00.000Z"),
  );
  assert.equal(window.state, "expired");
  assert.equal(window.active, false);
});

test("marks future windows scheduled and missing dates inactive", () => {
  assert.equal(
    assessAccessWindow("2026-11-13", "2026-11-30", new Date("2026-11-12T12:00:00Z")).state,
    "scheduled",
  );
  assert.equal(assessAccessWindow(null, null).state, "not-configured");
});

test("limits access windows to one calendar month and validates real dates", () => {
  assert.equal(getMaxAccessWindowEnd("2026-11-12"), "2026-12-12");
  assert.equal(validateAccessWindow("2026-11-12", "2026-11-30"), null);
  assert.match(
    validateAccessWindow("2026-11-12", "2026-12-13") ?? "",
    /one calendar month/,
  );
  assert.match(validateAccessWindow("2026-02-30", "2026-03-01") ?? "", /valid calendar dates/);
  assert.match(validateAccessWindow("2026-11-30", "2026-11-12") ?? "", /on or after/);
  assert.match(validateAccessWindow("2026-11-12", null) ?? "", /both/);
});

test("uses the Asia/Kolkata calendar date rather than UTC", () => {
  assert.equal(getKolkataDate(new Date("2026-11-12T20:00:00.000Z")), "2026-11-13");
});
