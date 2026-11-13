import { createInsertSchema } from "drizzle-zod";
import { date, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const userBriefingPreferences = pgTable("user_briefing_preferences", {
  userId: text("user_id").primaryKey(),
  dailyEventLimit: integer("daily_event_limit").notNull().default(10),
  accessWindowFrom: date("access_window_from", { mode: "string" }),
  accessWindowThrough: date("access_window_through", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertUserBriefingPreferenceSchema = createInsertSchema(
  userBriefingPreferences,
).omit({ createdAt: true, updatedAt: true });

export type InsertUserBriefingPreference = z.infer<
  typeof insertUserBriefingPreferenceSchema
>;
export type UserBriefingPreference =
  typeof userBriefingPreferences.$inferSelect;
