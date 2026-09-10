import { db } from "core/db";
import onHttp, { getTraceId } from "core/triggers/http";

import { and, desc, eq, lt } from "drizzle-orm";
import Elysia from "elysia";
import { platforms, platformStatusChecks } from "extensions/db/platform-status";
import { PLATFORMS } from "utils/statusPlatform";
import z from "zod";
import { checkPlatformStatus } from "./checkStatus";
import { buildSegments } from "./history";

const HISTORY_PAGE_SIZE = 100;

function latestChecksSubquery() {
    return db
        .selectDistinctOn([platformStatusChecks.platformId], {
            platformId: platformStatusChecks.platformId,
            status: platformStatusChecks.status,
            problemDescription: platformStatusChecks.problemDescription,
            checkedAt: platformStatusChecks.checkedAt,
        })
        .from(platformStatusChecks)
        .orderBy(platformStatusChecks.platformId, desc(platformStatusChecks.checkedAt))
        .as("latest_checks");
}

async function getPlatformsWithLatestStatus(platformId?: string) {
    const latestChecks = latestChecksSubquery();
    const query = db
        .select({
            id: platforms.id,
            name: platforms.name,
            url: platforms.url,
            type: platforms.type,
            status: latestChecks.status,
            problemDescription: latestChecks.problemDescription,
            lastCheckedAt: latestChecks.checkedAt,
        })
        .from(platforms)
        .leftJoin(latestChecks, eq(platforms.id, latestChecks.platformId));

    if (platformId) {
        return query.where(eq(platforms.id, platformId));
    }
    return query;
}

export const platformStatusElysiaClient = new Elysia({
    prefix: "/platform-stats",
})
    .get("/list-platforms", async () => {
        const response = await getPlatformsWithLatestStatus();
        return response;
    })
    .get(
        "/:id/history",
        async ({ params, query }) => {
            const before = query.before ? new Date(query.before) : new Date();
            const checks = await db
                .select({
                    status: platformStatusChecks.status,
                    problemDescription: platformStatusChecks.problemDescription,
                    checkedAt: platformStatusChecks.checkedAt,
                })
                .from(platformStatusChecks)
                .where(
                    and(
                        eq(platformStatusChecks.platformId, params.id),
                        lt(platformStatusChecks.checkedAt, before),
                    ),
                )
                .orderBy(desc(platformStatusChecks.checkedAt))
                .limit(HISTORY_PAGE_SIZE);

            const ordered = checks.slice().reverse();
            const segments = buildSegments(ordered);
            const oldestCheck = checks.at(-1);

            return {
                checks: ordered,
                segments,
                hasMore: checks.length === HISTORY_PAGE_SIZE,
                nextCursor: oldestCheck ? oldestCheck.checkedAt.toISOString() : null,
            };
        },
        {
            params: z.object({
                id: z.string(),
            }),
            query: z.object({
                before: z.string().optional(),
            }),
        },
    )
    .post(
        "/new",
        async ({ body, set }) => {
            const [created] = await db
                .insert(platforms)
                .values([
                    {
                        name: body.name,
                        url: body.url,
                        type: body.type,
                    },
                ])
                .returning();
            if (!created) return [];
            await checkPlatformStatus(created, getTraceId(set.headers));
            return getPlatformsWithLatestStatus(created.id);
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
        async ({ params, body, set }) => {
            const [updated] = await db
                .update(platforms)
                .set({
                    name: body.name,
                    url: body.url,
                    type: body.type,
                })
                .where(eq(platforms.id, params.id))
                .returning();
            if (!updated) return [];
            await checkPlatformStatus(updated, getTraceId(set.headers));
            return getPlatformsWithLatestStatus(updated.id);
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
        dontTrace: true,
    },
    platformStatusElysiaClient,
);
