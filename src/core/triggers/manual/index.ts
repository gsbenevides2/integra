import { addTracerEvent, endTracer, startTracer } from "core/instrumentation";
import type { TracerStatus } from "core/instrumentation/types";
import type { Trigger, TriggerSettings } from "core/triggers";

export interface ManualSettings extends TriggerSettings {}
export interface ManualTrigger extends Trigger {
    call: (input?: object, traceId?: string) => Promise<void>;
}

export type ManualCall = (traceId: string) => Promise<void>;

export default function onManual(settings: ManualSettings, func: ManualCall): ManualTrigger {
    const call = async (input: object = {}, traceId: string = crypto.randomUUID()) => {
        let status: TracerStatus = "SUCCESS";
        await startTracer({
            inputData: input,
            traceId,
            triggerId: settings.id,
            workflowType: "manual",
        });
        try {
            await func(traceId);
        } catch (error: unknown) {
            await addTracerEvent({
                traceId,
                eventData: error as object,
                eventName: "Manual on Error",
                eventType: "ERROR",
            });
            status = "ERROR";
            throw error;
        } finally {
            await endTracer({
                outputData: {},
                status,
                traceId,
            });
        }
    };

    return {
        id: settings.id,
        register: async () => {},
        call,
        test: async () => {
            await call();
        },
    };
}
