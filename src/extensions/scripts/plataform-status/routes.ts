import { db } from "core/db";
import onHttp from "core/triggers/http";

import Elysia from "elysia";
import { plataforms } from "extensions/db/plataform-status";

export const plataformStatusElysiaClient = new Elysia({
    prefix: "/plataform-stats",
}).post("/list-plataforms", async () => {
    const response = await db.select().from(plataforms);
    return response;
});

export const plataformStatusRoutes = onHttp(
    {
        id: "plataform-status-routes",
    },
    plataformStatusElysiaClient,
);
