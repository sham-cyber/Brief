// Copyright 2026 Sham Mohite
// Author: Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const telegramUserCredentialsTable = pgTable("telegram_user_credentials", {
  userId: text("user_id").primaryKey(),
  encryptedConfig: text("encrypted_config").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTelegramUserCredentialSchema = createInsertSchema(
  telegramUserCredentialsTable,
).omit({ createdAt: true, updatedAt: true });

export type InsertTelegramUserCredential = z.infer<
  typeof insertTelegramUserCredentialSchema
>;
export type TelegramUserCredential =
  typeof telegramUserCredentialsTable.$inferSelect;
