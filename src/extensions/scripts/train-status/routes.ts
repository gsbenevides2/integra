import { db } from "core/db";
import onHttp from "core/triggers/http";

import { and, desc, eq, lt } from "drizzle-orm";
import Elysia from "elysia";
import { trainStatusChecks } from "extensions/db/train-status";
import z from "zod";
import { buildSegments } from "./history";

const HISTORY_PAGE_SIZE = 100;

async function getLinesWithLatestStatus() {
    const lines = await db
        .selectDistinctOn([trainStatusChecks.lineCode], {
            lineCode: trainStatusChecks.lineCode,
            lineColor: trainStatusChecks.lineColor,
            situation: trainStatusChecks.situation,
            status: trainStatusChecks.status,
            description: trainStatusChecks.description,
            checkedAt: trainStatusChecks.checkedAt,
        })
        .from(trainStatusChecks)
        .orderBy(trainStatusChecks.lineCode, desc(trainStatusChecks.checkedAt));

    return lines.sort((a, b) => a.lineCode - b.lineCode);
}

export const trainStatusElysiaClient = new Elysia({
    prefix: "/train-stats",
})
    .get("/list-lines", async () => {
        return getLinesWithLatestStatus();
    })
    .get(
        "/:code/history",
        async ({ params, query }) => {
            const before = query.before ? new Date(query.before) : new Date();
            const lineCode = Number(params.code);
            const checks = await db
                .select({
                    status: trainStatusChecks.status,
                    situation: trainStatusChecks.situation,
                    description: trainStatusChecks.description,
                    checkedAt: trainStatusChecks.checkedAt,
                })
                .from(trainStatusChecks)
                .where(
                    and(
                        eq(trainStatusChecks.lineCode, lineCode),
                        lt(trainStatusChecks.checkedAt, before),
                    ),
                )
                .orderBy(desc(trainStatusChecks.checkedAt))
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
                code: z.string(),
            }),
            query: z.object({
                before: z.string().optional(),
            }),
        },
    );

export const trainStatusRoutes = onHttp(
    {
        id: "train-status-routes",
    },
    trainStatusElysiaClient,
);
