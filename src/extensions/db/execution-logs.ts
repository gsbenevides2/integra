import { index, jsonb, pgSchema, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const executionLogsSchema = pgSchema("execution_logs");

export const tracerStatusEnum = executionLogsSchema.enum("tracer_status", ["SUCCESS", "ERROR"]);

export const eventTypeEnum = executionLogsSchema.enum("event_type", ["INFO", "ERROR"]);

export const runs = executionLogsSchema.table(
    "runs",
    {
        id: text()
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        traceId: text().notNull(),
        triggerId: text().notNull(),
        startTime: timestamp({ withTimezone: true }).notNull(),
        endTime: timestamp({ withTimezone: true }),
        workflowType: text().notNull(),
        inputData: jsonb(),
        outputData: jsonb(),
        status: tracerStatusEnum(),
    },
    (table) => [
        uniqueIndex("runs_trace_id_idx").on(table.traceId),
        index("runs_start_time_idx").on(table.startTime),
        index("runs_workflow_type_idx").on(table.workflowType),
        index("runs_status_idx").on(table.status),
        index("runs_trigger_id_idx").on(table.triggerId),
    ],
);

export const runEvents = executionLogsSchema.table(
    "run_events",
    {
        id: text()
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        runId: text()
            .notNull()
            .references(() => runs.id, { onDelete: "cascade" }),
        eventName: text().notNull(),
        eventData: jsonb(),
        eventType: eventTypeEnum().notNull(),
        dateTime: timestamp({ withTimezone: true }).notNull(),
    },
    (table) => [index("run_events_run_id_idx").on(table.runId)],
);
