import { addTracerEvent, endTracer, startTracer } from "core/instrumentation";
import type { TracerStatus } from "core/instrumentation/types";
import type { Trigger, TriggerSettings } from "core/triggers";

export interface CronSettings extends TriggerSettings {
    cron: Bun.CronWithAutocomplete;
    runTriggerOnEnds?: string;
}
export interface CronTrigger extends Trigger {}

export type CronCall = (cronJob: Bun.CronJob, traceId: string) => Promise<void>;

export default function onCron(settings: CronSettings, func: CronCall): CronTrigger {
    return {
        id: settings.id,
        register: async () => {
            Bun.cron(settings.cron, async function () {
                let status: TracerStatus = "SUCCESS";
                const traceId = crypto.randomUUID();
                await startTracer({
                    inputData: {
                        cron: settings.cron,
                    },
                    traceId,
                    triggerId: settings.id,
                    workflowType: "cron",
                });
                try {
                    await func(this, traceId);
                } catch (error: unknown) {
                    await addTracerEvent({
                        traceId,
                        eventData: error as object,
                        eventName: "Cron on Error",
                        eventType: "ERROR",
                    });
                    status = "ERROR";
                } finally {
                    await endTracer({
                        outputData: {},
                        status,
                        traceId,
                    });
                    if (settings.runTriggerOnEnds) {
                        const trigger = global.triggers.find(
                            (t) => t.id === settings.runTriggerOnEnds,
                        );
                        if (trigger && trigger.test) {
                            trigger.test();
                        }
                    }
                }
            });
        },
        test: async () => {
            const cronJob: Bun.CronJob = {
                cron: settings.cron,
                ref: function () {
                    return this;
                },
                stop: function () {
                    return this;
                },
                unref: function () {
                    return this;
                },
                [Symbol.dispose]() {
                    //this.disposed = true;
                },
            };
            let status: TracerStatus = "SUCCESS";
            const traceId = crypto.randomUUID();
            await startTracer({
                inputData: {
                    cron: settings.cron,
                },
                traceId,
                triggerId: settings.id,
                workflowType: "cron",
            });
            try {
                await func(cronJob, traceId);
            } catch (error: unknown) {
                await addTracerEvent({
                    traceId,
                    eventData: error as object,
                    eventName: "Cron on Error",
                    eventType: "ERROR",
                });
                status = "ERROR";
            } finally {
                await endTracer({
                    outputData: {},
                    status,
                    traceId,
                });
            }
        },
    };
}
