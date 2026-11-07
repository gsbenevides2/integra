import { index, integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

export const birthday = pgSchema("birthday");

export const birthdayEvents = birthday.table(
  "events",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text().notNull(),
    month: integer().notNull(),
    day: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("birthday_events_month_day_idx").on(table.month, table.day)],
);
