import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const savedPersonProfilesTable = pgTable(
  "saved_person_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    personName: text("person_name").notNull(),
    personRole: text("person_role").notNull(),
    publicRoleTitle: text("public_role_title"),
    companyName: text("company_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerNameRole: uniqueIndex("saved_person_profiles_owner_name_role_idx").on(
      table.userId,
      table.personName,
      table.personRole,
    ),
  }),
);

export const insertSavedPersonProfileSchema = createInsertSchema(
  savedPersonProfilesTable,
).omit({ createdAt: true, updatedAt: true });

export type InsertSavedPersonProfile = z.infer<
  typeof insertSavedPersonProfileSchema
>;
export type SavedPersonProfile = typeof savedPersonProfilesTable.$inferSelect;
