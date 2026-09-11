import { pgSchema, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const googleAccountsSchema = pgSchema("google_accounts");

export const googleAccounts = googleAccountsSchema.table(
    "accounts",
    {
        id: text()
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        email: text().notNull(),
        refreshToken: text(),
        accessToken: text(),
        expiryDate: timestamp({ withTimezone: true }),
        idToken: text(),
        tokenType: text(),
    },
    (table) => [uniqueIndex("google_accounts_email_idx").on(table.email)],
);
