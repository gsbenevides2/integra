import type { EventType, TracerStatus } from "core/instrumentation/types";

export interface TracerEvent {
    eventId: string;
    eventName: string;
    eventData?: Record<string, unknown>;
    eventType: EventType;
    dateTime?: Date;
}

export interface RunDocument {
    traceId: string;
    triggerId: string;
    startTime: Date;
    endTime?: Date;
    workflowType: string;
    inputData?: Record<string, unknown>;
    outputData?: Record<string, unknown>;
    status?: TracerStatus;
    events: TracerEvent[];
    durationMs?: number | null;
}

export interface RunFilters {
    workflowType?: string;
    status?: TracerStatus;
    triggerId?: string;
    startTimeGte?: string;
    startTimeLte?: string;
    cursor?: string;
    limit?: number;
    sortField?: string;
    sortOrder?: "asc" | "desc";
}
