import { pgSchema, text } from "drizzle-orm/pg-core";
import { PLATAFORMS } from "utils/statusPlataform";

export const statusPlataform = pgSchema("status_platafom");

export const plataformTypeEnum = statusPlataform.enum("plataform_type", PLATAFORMS);

export const plataforms = statusPlataform.table("plataforms", {
    id: text()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    name: text().notNull(),
    url: text().notNull(),
    type: plataformTypeEnum().notNull(),
});
