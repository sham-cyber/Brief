import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyBriefingStartPin } from "./briefing-start-pin.ts";

test("Telegram and crawl actions use the same four-digit PIN check", () => {
  const previous = process.env.BRIEFING_START_PIN;
  process.env.BRIEFING_START_PIN = "8274";
  try {
    const userId = `telegram-pin-test-${Date.now()}`;
    assert.deepEqual(verifyBriefingStartPin(userId, "0000"), {
      valid: false,
      status: 403,
      message: "The start PIN is incorrect.",
    });
    assert.deepEqual(verifyBriefingStartPin(userId, "8274"), { valid: true });
  } finally {
    if (previous === undefined) delete process.env.BRIEFING_START_PIN;
    else process.env.BRIEFING_START_PIN = previous;
  }
});
