import { db } from "core/db";
import onHttp from "core/triggers/http";

import { eq } from "drizzle-orm";
import Elysia from "elysia";
import { platforms } from "extensions/db/platform-status";
import { PLATFORMS } from "utils/statusPlatform";
import z from "zod";

export const platformStatusElysiaClient = new Elysia({
    prefix: "/platform-stats",
})
    .get("/list-platforms", async () => {
        const response = await db.select().from(platforms);
        return response;
    })
    .post(
        "/new",
        async ({ body }) => {
            const response = await db
                .insert(platforms)
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
                type: z.enum(PLATFORMS),
            }),
        },
    )
    .delete(
        "/:id",
        async ({ params }) => {
            const response = await db
                .delete(platforms)
                .where(eq(platforms.id, params.id))
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
                .update(platforms)
                .set({
                    name: body.name,
                    url: body.url,
                    type: body.type,
                })
                .where(eq(platforms.id, params.id))
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
                type: z.enum(PLATFORMS),
            }),
        },
    );

export const platformStatusRoutes = onHttp(
    {
        id: "platform-status-routes",
    },
    platformStatusElysiaClient,
);
