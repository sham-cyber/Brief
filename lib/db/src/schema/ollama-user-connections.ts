import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const ollamaUserConnections = pgTable("ollama_user_connections", {
  userId: text("user_id").primaryKey(),
  encryptedConfig: text("encrypted_config").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
