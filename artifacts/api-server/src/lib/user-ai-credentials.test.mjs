import assert from "node:assert/strict";
import test from "node:test";
import { decryptUserAiKey, encryptUserAiKey } from "./ai-credential-crypto.ts";

test("saved AI keys are encrypted and account-bound", (t) => {
  const originalKey = process.env.USER_CREDENTIALS_ENCRYPTION_KEY;
  process.env.USER_CREDENTIALS_ENCRYPTION_KEY = "ab".repeat(32);
  t.after(() => {
    if (originalKey === undefined) delete process.env.USER_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.USER_CREDENTIALS_ENCRYPTION_KEY = originalKey;
  });

  const apiKey = "sk-test-not-a-real-provider-credential";
  const encrypted = encryptUserAiKey("account-one", apiKey);
  assert.equal(encrypted.encryptedKey.includes(apiKey), false);
  assert.equal(decryptUserAiKey("account-one", encrypted), apiKey);
  assert.throws(() => decryptUserAiKey("account-two", encrypted));

  const tampered = { ...encrypted, authTag: Buffer.alloc(16).toString("base64") };
  assert.throws(() => decryptUserAiKey("account-one", tampered));
});
