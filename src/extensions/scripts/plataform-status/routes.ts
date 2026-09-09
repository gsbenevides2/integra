import { db } from "core/db";
import onHttp from "core/triggers/http";

import Elysia from "elysia";
import { PLATAFORMS, plataforms } from "extensions/db/plataform-status";
import z from "zod";

export const plataformStatusElysiaClient = new Elysia({
    prefix: "/plataform-stats",
})
    .get("/list-plataforms", async () => {
        const response = await db.select().from(plataforms);
        return response;
    })
    .post(
        "/new",
        async ({ body }) => {
            const response = await db
                .insert(plataforms)
                .values([
                    {
                        name: body.name,
                        url: body.url,
                        type: body.type,
                    },
                ])
                .returning();
            return response;
        },
        {
            body: z.object({
                name: z.string(),
                url: z.string(),
                type: z.enum(PLATAFORMS),
            }),
        },
    );

export const plataformStatusRoutes = onHttp(
    {
        id: "plataform-status-routes",
    },
    plataformStatusElysiaClient,
);
