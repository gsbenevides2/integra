import { db } from "core/db";
import onHttp from "core/triggers/http";

import { desc, lt } from "drizzle-orm";
import Elysia from "elysia";
import { serverMetricsSnapshots } from "extensions/db/server-metrics";
import z from "zod";

const HISTORY_PAGE_SIZE = 200;

export const serverMetricsElysiaClient = new Elysia({
    prefix: "/server-metrics",
})
    .get("/latest", async () => {
        const [latest] = await db
            .select()
            .from(serverMetricsSnapshots)
            .orderBy(desc(serverMetricsSnapshots.collectedAt))
            .limit(1);
        return latest ?? null;
    })
    .get(
        "/history",
        async ({ query }) => {
            const before = query.before ? new Date(query.before) : new Date();
            const snapshots = await db
                .select()
                .from(serverMetricsSnapshots)
                .where(lt(serverMetricsSnapshots.collectedAt, before))
                .orderBy(desc(serverMetricsSnapshots.collectedAt))
                .limit(HISTORY_PAGE_SIZE);

            const ordered = snapshots.slice().reverse();
            const oldest = snapshots.at(-1);

            return {
                snapshots: ordered,
                hasMore: snapshots.length === HISTORY_PAGE_SIZE,
                nextCursor: oldest ? oldest.collectedAt.toISOString() : null,
            };
        },
        {
            query: z.object({
                before: z.string().optional(),
            }),
        },
    );

export const serverMetricsRoutes = onHttp(
    {
        id: "server-metrics-routes",
        dontTrace: true,
    },
    serverMetricsElysiaClient,
);
