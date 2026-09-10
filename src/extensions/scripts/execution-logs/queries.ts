import { db } from "core/db";
import { runEvents, runs } from "extensions/db/schema";
import { and, asc, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import type { RunDocument, RunFilters, TracerEvent } from "./types";

function calculateDurationMs(startTime: Date, endTime?: Date | null): number | null {
    if (!endTime) return null;
    return new Date(endTime).getTime() - new Date(startTime).getTime();
}

function buildFilter(filters: RunFilters): SQL | undefined {
    const conditions: SQL[] = [];
    if (filters.workflowType) conditions.push(eq(runs.workflowType, filters.workflowType));
    if (filters.status) conditions.push(eq(runs.status, filters.status));
    if (filters.triggerId) conditions.push(eq(runs.triggerId, filters.triggerId));
    if (filters.startTimeGte) conditions.push(gte(runs.startTime, new Date(filters.startTimeGte)));
    if (filters.startTimeLte) conditions.push(lte(runs.startTime, new Date(filters.startTimeLte)));
    if (filters.cursor) {
        const cursorDate = new Date(filters.cursor);
        conditions.push(
            filters.sortOrder === "asc"
                ? gte(runs.startTime, cursorDate)
                : lte(runs.startTime, cursorDate),
        );
    }
    return conditions.length ? and(...conditions) : undefined;
}

function resolveSortColumn(sortField?: string) {
    if (sortField === "endTime") return runs.endTime;
    return runs.startTime;
}

export async function fetchRuns(filters: RunFilters) {
    const limit = Math.min(filters.limit ?? 200, 500);
    const order = filters.sortOrder === "asc" ? asc : desc;
    const sortColumn = resolveSortColumn(filters.sortField);
    const filter = buildFilter(filters);

    const rows = await db
        .select({
            traceId: runs.traceId,
            triggerId: runs.triggerId,
            startTime: runs.startTime,
            endTime: runs.endTime,
            workflowType: runs.workflowType,
            status: runs.status,
        })
        .from(runs)
        .where(filter)
        .orderBy(order(sortColumn), asc(runs.id))
        .limit(limit + 1);

    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    const runDocs = rows.map((doc) => ({
        ...doc,
        endTime: doc.endTime ?? undefined,
        status: doc.status ?? undefined,
        events: [] as TracerEvent[],
        durationMs: calculateDurationMs(doc.startTime, doc.endTime),
    })) as RunDocument[];

    const nextCursor =
        hasMore && runDocs.length > 0
            ? new Date(runDocs[runDocs.length - 1]!.startTime).toISOString()
            : null;

    return { runs: runDocs, nextCursor };
}

export async function fetchRunByTraceId(traceId: string) {
    const [run] = await db.select().from(runs).where(eq(runs.traceId, traceId)).limit(1);
    if (!run) return null;

    const events = await db
        .select({
            eventId: runEvents.id,
            eventName: runEvents.eventName,
            eventData: runEvents.eventData,
            eventType: runEvents.eventType,
            dateTime: runEvents.dateTime,
        })
        .from(runEvents)
        .where(eq(runEvents.runId, run.id))
        .orderBy(asc(runEvents.dateTime));

    return {
        traceId: run.traceId,
        triggerId: run.triggerId,
        startTime: run.startTime,
        endTime: run.endTime ?? undefined,
        workflowType: run.workflowType,
        inputData: run.inputData ?? undefined,
        outputData: run.outputData ?? undefined,
        status: run.status ?? undefined,
        events: events as TracerEvent[],
        durationMs: calculateDurationMs(run.startTime, run.endTime),
    } as RunDocument;
}

export async function getDistinctTriggerIds(): Promise<string[]> {
    const rows = await db.selectDistinct({ triggerId: runs.triggerId }).from(runs);
    return rows.map((row) => row.triggerId).sort();
}

export async function getDistinctWorkflowTypes(): Promise<string[]> {
    const rows = await db.selectDistinct({ workflowType: runs.workflowType }).from(runs);
    return rows.map((row) => row.workflowType).sort();
}

export async function clearAllRuns() {
    await db.delete(runs);
}
