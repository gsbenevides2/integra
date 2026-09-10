import { pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import { PLATFORMS } from "utils/statusPlatform";

export const statusPlatform = pgSchema("status_platform");

export const platformTypeEnum = statusPlatform.enum("platform_type", PLATFORMS);

export const platformStatusEnum = statusPlatform.enum("platform_status", ["OK", "DOWN"]);

export const platforms = statusPlatform.table("platforms", {
    id: text()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    name: text().notNull(),
    url: text().notNull(),
    type: platformTypeEnum().notNull(),
});

export const platformStatusChecks = statusPlatform.table("platform_status_checks", {
    id: text()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    platformId: text()
        .notNull()
        .references(() => platforms.id, { onDelete: "cascade" }),
    status: platformStatusEnum().notNull(),
    problemDescription: text(),
    checkedAt: timestamp({ withTimezone: true }).notNull(),
});
