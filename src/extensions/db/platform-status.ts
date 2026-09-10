import { pgSchema, text } from "drizzle-orm/pg-core";
import { PLATFORMS } from "utils/statusPlatform";

export const statusPlatform = pgSchema("status_platform");

export const platformTypeEnum = statusPlatform.enum("platform_type", PLATFORMS);

export const platforms = statusPlatform.table("platforms", {
    id: text()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    name: text().notNull(),
    url: text().notNull(),
    type: platformTypeEnum().notNull(),
});
