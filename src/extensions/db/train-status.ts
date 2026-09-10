import { integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

export const trainStatusSchema = pgSchema("train_status");

export const trainLineStatusEnum = trainStatusSchema.enum("train_line_status", [
    "OK",
    "WARNING",
    "CRITICAL",
    "UNKNOWN",
]);

export const trainStatusChecks = trainStatusSchema.table("train_status_checks", {
    id: text()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    lineCode: integer().notNull(),
    lineColor: text().notNull(),
    situation: text().notNull(),
    status: trainLineStatusEnum().notNull(),
    description: text(),
    checkedAt: timestamp({ withTimezone: true }).notNull(),
});
