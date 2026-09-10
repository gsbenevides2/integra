import { db } from "core/db";
import onHttp from "core/triggers/http";

import { eq } from "drizzle-orm";
import Elysia from "elysia";
import { plataforms } from "extensions/db/plataform-status";
import { PLATAFORMS } from "utils/statusPlataform";
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
    )
    .delete(
        "/:id",
        async ({ params }) => {
            const response = await db
                .delete(plataforms)
                .where(eq(plataforms.id, params.id))
                .returning();
            return response;
        },
        {
            params: z.object({
                id: z.string(),
            }),
        },
    )
    .patch(
        "/:id",
        async ({ params, body }) => {
            const response = await db
                .update(plataforms)
                .set({
                    name: body.name,
                    url: body.url,
                    type: body.type,
                })
                .where(eq(plataforms.id, params.id))
                .returning();
            return response;
        },
        {
            params: z.object({
                id: z.string(),
            }),
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
