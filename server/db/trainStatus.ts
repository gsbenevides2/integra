import { index, integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

export const trainStatus = pgSchema("train_status");

export const trainLineStatusEnum = trainStatus.enum("train_line_status", [
  "OK",
  "WARNING",
  "CRITICAL",
  "UNKNOWN",
]);

export const trainStatusChecks = trainStatus.table(
  "train_status_checks",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    lineCode: integer().notNull(),
    lineColor: text().notNull(),
    situation: text().notNull(),
    status: trainLineStatusEnum().notNull(),
    description: text(),
    checkedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [
    index("train_status_checks_line_checked_idx").on(
      table.lineCode,
      table.checkedAt.desc(),
    ),
  ],
);
