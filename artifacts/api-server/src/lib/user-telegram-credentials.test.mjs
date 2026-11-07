import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decryptTelegramConfig,
  encryptTelegramConfig,
  isTelegramCredentialStorageReady,
} from "./user-telegram-credentials.ts";

test("Telegram credentials are encrypted and bound to the account", () => {
  const previous = process.env.USER_CREDENTIALS_ENCRYPTION_KEY;
  process.env.USER_CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
  try {
    assert.equal(isTelegramCredentialStorageReady(), true);
    const config = {
      botToken: "123456:abcdefghijklmnopqrstuvwxyz0123456789",
      chatId: "987654321",
    };
    const encrypted = encryptTelegramConfig("user-one", config);
    assert.equal(encrypted.encryptedConfig.includes(config.botToken), false);
    assert.deepEqual(decryptTelegramConfig("user-one", encrypted), config);
    assert.throws(() => decryptTelegramConfig("user-two", encrypted));
  } finally {
    if (previous === undefined) delete process.env.USER_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.USER_CREDENTIALS_ENCRYPTION_KEY = previous;
  }
});

test("Telegram credential storage is disabled for a malformed encryption key", () => {
  const previous = process.env.USER_CREDENTIALS_ENCRYPTION_KEY;
  process.env.USER_CREDENTIALS_ENCRYPTION_KEY = "not-a-hex-key";
  try {
    assert.equal(isTelegramCredentialStorageReady(), false);
    assert.throws(() => encryptTelegramConfig("user-one", {
      botToken: "123456:abcdefghijklmnopqrstuvwxyz0123456789",
      chatId: "987654321",
    }));
  } finally {
    if (previous === undefined) delete process.env.USER_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.USER_CREDENTIALS_ENCRYPTION_KEY = previous;
  }
});
