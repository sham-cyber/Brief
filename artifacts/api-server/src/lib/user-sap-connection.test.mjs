import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptSapConfig,
  encryptSapConfig,
} from "./user-sap-connection.ts";

test("SAP connection encryption is confidential and account-bound", (t) => {
  const originalKey = process.env.USER_CREDENTIALS_ENCRYPTION_KEY;
  process.env.USER_CREDENTIALS_ENCRYPTION_KEY = "ab".repeat(32);
  t.after(() => {
    if (originalKey === undefined) delete process.env.USER_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.USER_CREDENTIALS_ENCRYPTION_KEY = originalKey;
  });

  const config = {
    serviceRoot: "https://sap.example.invalid/odata/",
    clientId: "sample-client",
    clientSecret: "sample-secret-that-must-not-be-plaintext",
  };
  const encrypted = encryptSapConfig("owner-account", config);
  assert.equal(encrypted.encryptedConfig.includes(config.clientSecret), false);
  assert.deepEqual(decryptSapConfig("owner-account", encrypted), config);
  assert.throws(() => decryptSapConfig("another-account", encrypted));

  const altered = { ...encrypted, authTag: Buffer.alloc(16).toString("base64") };
  assert.throws(() => decryptSapConfig("owner-account", altered));
});
