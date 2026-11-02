import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const briefingTavilyRequestUsage = pgTable(
  "briefing_tavily_request_usage",
  {
    id: serial("id").primaryKey(),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    requestCount: integer("request_count").notNull(),
  },
  (table) => ({
    requestedAt: index("briefing_tavily_request_usage_requested_at_idx").on(
      table.requestedAt,
    ),
  }),
);

export const insertBriefingTavilyRequestUsageSchema = createInsertSchema(
  briefingTavilyRequestUsage,
).omit({ id: true, requestedAt: true });
export type InsertBriefingTavilyRequestUsage = z.infer<
  typeof insertBriefingTavilyRequestUsageSchema
>;
export type BriefingTavilyRequestUsage =
  typeof briefingTavilyRequestUsage.$inferSelect;
