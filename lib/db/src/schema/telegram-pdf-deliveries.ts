// Copyright 2026 Sham Mohite
// Author: Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import { createInsertSchema } from "drizzle-zod";
import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const telegramPdfDeliveriesTable = pgTable(
  "telegram_pdf_deliveries",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    status: text("status").notNull().default("reserved"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    index("telegram_pdf_deliveries_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);

export const insertTelegramPdfDeliverySchema = createInsertSchema(
  telegramPdfDeliveriesTable,
).omit({ id: true, createdAt: true, sentAt: true });

export type InsertTelegramPdfDelivery = z.infer<
  typeof insertTelegramPdfDeliverySchema
>;
export type TelegramPdfDelivery =
  typeof telegramPdfDeliveriesTable.$inferSelect;
