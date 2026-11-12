// Copyright 2026 Sham Mohite
// Author: Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const webPushSubscriptionsTable = pgTable(
  "web_push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    endpointHash: text("endpoint_hash").notNull(),
    encryptedSubscription: text("encrypted_subscription").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerEndpoint: uniqueIndex("web_push_subscriptions_owner_endpoint_idx").on(
      table.userId,
      table.endpointHash,
    ),
  }),
);
