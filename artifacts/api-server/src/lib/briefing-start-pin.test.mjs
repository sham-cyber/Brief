import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashBriefingPin,
  verifyPinHash,
} from "./briefing-pin-crypto.ts";

test("account PIN hashes verify only the correct value", async () => {
  const salt = "0123456789abcdef";
  const hash = await hashBriefingPin("8274", salt);
  assert.equal(await verifyPinHash("8274", salt, hash), true);
  assert.equal(await verifyPinHash("0000", salt, hash), false);
});
