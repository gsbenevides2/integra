import { SQL } from "bun";
import type { Trigger, TriggerSettings } from "triggers";
import type { PostgresInstanceKey } from "./types";
import { postgresInstances } from "./instances";
import { addTracerEvent, endTracer, startTracer } from "instrumentation";
import type { TracerStatus } from "instrumentation/types";

export interface PostgresSettings extends TriggerSettings {
    instance: PostgresInstanceKey;
    query: string;
    intervalMs: number;
}

export interface PostgresSubscription {
    instance: PostgresInstanceKey;
    query: string;
    intervalMs: number;
    call: PostgresCall;
    triggerId: string;
}

export interface PostgresTrigger extends Trigger {}

export type PostgresCall = (rows: Record<string, unknown>[], traceId: string) => Promise<void>;

declare global {
    var postgresClients: Map<PostgresInstanceKey, SQL> | undefined;
    var postgresSubscriptions: PostgresSubscription[] | undefined;
    var postgresIntervals: Map<string, Timer> | undefined;
}

export default function onPostgres(
    settings: PostgresSettings,
    func: PostgresCall,
): PostgresTrigger {
    return {
        id: settings.id,
        register: async () => {
            if (!global.postgresSubscriptions) global.postgresSubscriptions = [];

            global.postgresSubscriptions = [
                ...global.postgresSubscriptions,
                {
                    instance: settings.instance,
                    query: settings.query,
                    intervalMs: settings.intervalMs,
                    call: func,
                    triggerId: settings.id,
                },
            ];
        },
    };
}

export async function startPostgresClients() {
    if (!global.postgresSubscriptions) return;
    if (!global.postgresIntervals) global.postgresIntervals = new Map();

    for (const [key, config] of Object.entries(postgresInstances)) {
        const instanceKey = key as PostgresInstanceKey;
        const subs = global.postgresSubscriptions.filter((sub) => sub.instance === instanceKey);
        if (subs.length === 0) continue;

        const sql = new SQL(config.url);
        if (!global.postgresClients) global.postgresClients = new Map();
        global.postgresClients.set(instanceKey, sql);

        const nonDuplicatedQueries = subs.filter(
            (sub, index, arr) => index === arr.findIndex((s) => s.query === sub.query),
        );

        for (const sub of nonDuplicatedQueries) {
            const intervalId = setInterval(async () => {
                try {
                    const rows = (await sql.unsafe(sub.query)) as Record<string, unknown>[];
                    const querySubs = subs.filter((s) => s.query === sub.query);
                    await Promise.all(
                        querySubs.map(async (s) => {
                            const traceId = crypto.randomUUID();
                            await startTracer({
                                inputData: {
                                    subs: sub,
                                    rows,
                                },
                                traceId,
                                triggerId: sub.triggerId,
                                workflowType: "Postgres",
                            });
                            let status: TracerStatus = "SUCCESS";
                            try {
                                await s.call(rows, traceId);
                            } catch (error: unknown) {
                                await addTracerEvent({
                                    eventData: error as object,
                                    eventName: "Postgres on Error",
                                    eventType: "ERROR",
                                    traceId,
                                });
                                status = "ERROR";
                            } finally {
                                await endTracer({
                                    outputData: {},
                                    status,
                                    traceId,
                                });
                            }
                        }),
                    );
                } catch (err) {
                    console.debug(`Erro Postgres query ${instanceKey}:`, err);
                }
            }, sub.intervalMs);

            global.postgresIntervals.set(`${instanceKey}:${sub.query}`, intervalId);
        }

        process.on("SIGTERM", () => {
            for (const [k, id] of global.postgresIntervals!) {
                if (k.startsWith(instanceKey)) clearInterval(id);
            }
            sql.close();
        });
        process.on("SIGKILL", () => {
            for (const [k, id] of global.postgresIntervals!) {
                if (k.startsWith(instanceKey)) clearInterval(id);
            }
            sql.close();
        });
    }
}
