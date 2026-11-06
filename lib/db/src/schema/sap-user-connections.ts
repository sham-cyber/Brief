// Copyright 2026 Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const sapUserConnectionsTable = pgTable("sap_user_connections", {
  userId: text("user_id").primaryKey(),
  encryptedConfig: text("encrypted_config").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
