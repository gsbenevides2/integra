import { boolean, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

export const cloudflare = pgSchema("cloudflare");

export const bypassToken = cloudflare.table("bypass_tokens", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  active: boolean().default(false),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
