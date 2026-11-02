import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const briefingTavilyUsage = pgTable(
  "briefing_tavily_usage",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reservedMs: integer("reserved_ms").notNull(),
    durationMs: integer("duration_ms"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => ({
    ownerStartedAt: index("briefing_tavily_usage_owner_started_at_idx").on(
      table.userId,
      table.startedAt,
    ),
  }),
);
