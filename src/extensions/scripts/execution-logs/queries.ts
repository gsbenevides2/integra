import { runModel } from "core/instrumentation/mongo";
import type { QueryFilter } from "mongoose";
import type { RunDocument, RunFilters } from "./types";

function calculateDurationMs(startTime: Date, endTime?: Date | null): number | null {
    if (!endTime) return null;
    return new Date(endTime).getTime() - new Date(startTime).getTime();
}

function buildFilter(filters: RunFilters): QueryFilter<RunDocument> {
    const filter: QueryFilter<RunDocument> = {};
    if (filters.workflowType) filter.workflowType = filters.workflowType;
    if (filters.status) filter.status = filters.status;
    if (filters.triggerId) filter.triggerId = filters.triggerId;

    const startTimeFilter: Record<string, Date> = {};
    if (filters.startTimeGte) startTimeFilter.$gte = new Date(filters.startTimeGte);
    if (filters.cursor) {
        const cursorDate = new Date(filters.cursor);
        const order = filters.sortOrder === "asc" ? "$gte" : "$lte";
        startTimeFilter[order] = cursorDate;
    }
    if (filters.startTimeLte) startTimeFilter.$lte = new Date(filters.startTimeLte);
    if (Object.keys(startTimeFilter).length) filter.startTime = startTimeFilter;

    return filter;
}

export async function fetchRuns(filters: RunFilters) {
    const limit = Math.min(filters.limit ?? 200, 500);
    const sortOrder = filters.sortOrder === "asc" ? 1 : -1;
    const sortField = filters.sortField ?? "startTime";
    const filter = buildFilter(filters);

    const docs = await runModel
        .find(filter)
        .select("traceId triggerId startTime endTime workflowType status")
        .sort({ [sortField]: sortOrder, _id: 1 })
        .limit(limit + 1)
        .lean();

    const hasMore = docs.length > limit;
    if (hasMore) docs.pop();

    const runs = docs.map((doc) => ({
        ...doc,
        durationMs: calculateDurationMs(doc.startTime, doc.endTime),
    })) as RunDocument[];

    const nextCursor =
        hasMore && runs.length > 0
            ? new Date(runs[runs.length - 1]!.startTime).toISOString()
            : null;

    return { runs, nextCursor };
}

export async function fetchRunByTraceId(traceId: string) {
    const doc = await runModel.findOne({ traceId }).lean();
    if (!doc) return null;
    return {
        ...doc,
        durationMs: calculateDurationMs(doc.startTime, doc.endTime),
    } as RunDocument;
}

export async function getDistinctTriggerIds(): Promise<string[]> {
    const triggerIds = await runModel.distinct("triggerId");
    return (triggerIds as string[]).sort();
}

export async function getDistinctWorkflowTypes(): Promise<string[]> {
    const workflowTypes = await runModel.distinct("workflowType");
    return (workflowTypes as string[]).sort();
}
