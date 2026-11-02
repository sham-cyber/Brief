import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const userAiGuardrails = pgTable("user_ai_guardrails", {
  userId: text("user_id").primaryKey(),
  passcodeSalt: text("passcode_salt").notNull(),
  passcodeHash: text("passcode_hash").notNull(),
  isActivated: boolean("is_activated").notNull().default(false),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const aiBriefingRequests = pgTable(
  "ai_briefing_requests",
  {
    userId: text("user_id").notNull(),
    briefingId: text("briefing_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ownerBriefing: primaryKey({
      columns: [table.userId, table.briefingId],
    }),
  }),
);
