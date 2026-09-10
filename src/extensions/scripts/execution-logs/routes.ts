import onHttp from "core/triggers/http";
import Elysia from "elysia";
import z from "zod";
import {
    fetchRunByTraceId,
    fetchRuns,
    getDistinctTriggerIds,
    getDistinctWorkflowTypes,
} from "./queries";

export const executionLogsElysiaClient = new Elysia({
    prefix: "/execution-logs",
})
    .get(
        "/runs",
        async ({ query }) => {
            return fetchRuns({
                workflowType: query.workflowType,
                status: query.status,
                triggerId: query.triggerId,
                startTimeGte: query.startTimeGte,
                startTimeLte: query.startTimeLte,
                cursor: query.cursor,
                limit: query.limit ? Number(query.limit) : undefined,
                sortField: query.sortField,
                sortOrder: query.sortOrder,
            });
        },
        {
            query: z.object({
                workflowType: z.string().optional(),
                status: z.enum(["SUCCESS", "ERROR"]).optional(),
                triggerId: z.string().optional(),
                startTimeGte: z.string().optional(),
                startTimeLte: z.string().optional(),
                cursor: z.string().optional(),
                limit: z.string().optional(),
                sortField: z.string().optional(),
                sortOrder: z.enum(["asc", "desc"]).optional(),
            }),
        },
    )
    .get(
        "/runs/:traceId",
        async ({ params, set }) => {
            const run = await fetchRunByTraceId(params.traceId);
            if (!run) {
                set.status = 404;
                return { error: "Run não encontrado" };
            }
            return run;
        },
        {
            params: z.object({
                traceId: z.string(),
            }),
        },
    )
    .get("/trigger-ids", async () => {
        const triggerIds = await getDistinctTriggerIds();
        return { triggerIds };
    })
    .get("/workflow-types", async () => {
        const workflowTypes = await getDistinctWorkflowTypes();
        return { workflowTypes };
    });

export const executionLogsRoutes = onHttp(
    {
        id: "execution-logs-routes",
        dontTrace: true,
    },
    executionLogsElysiaClient,
);
