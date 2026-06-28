export interface StartTracerParams {
    traceId: string;
    triggerId: string;
    workflowType: string;
    inputData: object;
}

export type TracerStatus = "SUCCESS" | "ERROR";

export interface EndTracerParams {
    traceId: string;
    outputData: object;
    status: TracerStatus;
}

export type EventType = "INFO" | "ERROR";

export interface CreateEventData {
    traceId: string;
    eventName: string;
    eventData: object;
    eventType: EventType;
}
