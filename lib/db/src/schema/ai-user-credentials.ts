import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const aiUserCredentials = pgTable("ai_user_credentials", {
  userId: text("user_id").primaryKey(),
  encryptedKey: text("encrypted_key").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAiUserCredentialSchema = createInsertSchema(
  aiUserCredentials,
).omit({ createdAt: true, updatedAt: true });

export type InsertAiUserCredential = typeof aiUserCredentials.$inferInsert;
export type AiUserCredential = typeof aiUserCredentials.$inferSelect;
