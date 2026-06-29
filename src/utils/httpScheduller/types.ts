export interface SchedulledRequest {
    body: string;
    excludeBeforeExecution: boolean;
    externalId: string;
    headers: Record<string, string>;
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    triggerType: "cron" | "date";
    triggerValue: string;
    url: string;
}
