import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const tavilyUserCredentialsTable = pgTable("tavily_user_credentials", {
  userId: text("user_id").primaryKey(),
  encryptedKey: text("encrypted_key").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTavilyUserCredentialSchema = createInsertSchema(
  tavilyUserCredentialsTable,
).omit({ createdAt: true, updatedAt: true });

export type InsertTavilyUserCredential = z.infer<
  typeof insertTavilyUserCredentialSchema
>;
export type TavilyUserCredential =
  typeof tavilyUserCredentialsTable.$inferSelect;
