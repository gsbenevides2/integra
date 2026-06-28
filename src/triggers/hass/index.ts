import type { Trigger, TriggerSettings } from "triggers";
import type { InstanceKey } from "./types";
import { instanceSettings } from "./instances";
import type { TracerStatus } from "instrumentation/types";
import { startTracer, addTracerEvent, endTracer } from "instrumentation";

export interface HassSettings extends TriggerSettings {
    instance: InstanceKey;
    eventType?: string;
    entityId?: string;
}

export interface HassSubscription {
    instance: InstanceKey;
    eventType: string;
    entityId?: string;
    call: HassCall;
    triggerId: string;
}

export interface HassTrigger extends Trigger {}

export type HassCall = (event: Record<string, unknown>, traceId: string) => Promise<void>;

declare global {
    var haWebSockets: Map<InstanceKey, WebSocket> | undefined;
    var haSubscriptions: HassSubscription[] | undefined;
}

export default function onHassEvent(settings: HassSettings, func: HassCall): HassTrigger {
    return {
        id: settings.id,
        register: async () => {
            if (!global.haSubscriptions) global.haSubscriptions = [];

            global.haSubscriptions = [
                ...global.haSubscriptions,
                {
                    instance: settings.instance,
                    eventType: settings.eventType ?? "state_changed",
                    entityId: settings.entityId,
                    call: func,
                    triggerId: settings.id,
                },
            ];
        },
    };
}

export async function startHaClients() {
    if (!global.haSubscriptions) return;

    for (const [key, instance] of Object.entries(instanceSettings)) {
        const instanceKey = key as InstanceKey;
        const subs = global.haSubscriptions.filter((sub) => sub.instance === instanceKey);
        if (subs.length === 0) continue;

        const { url, token } = instance;
        const wsUrl = url.replace(/^http/, "ws") + "/api/websocket";

        const ws = new WebSocket(wsUrl);

        if (!global.haWebSockets) global.haWebSockets = new Map();
        global.haWebSockets.set(instanceKey, ws);

        let nextId = 1;

        ws.onopen = () => {
            console.debug(`HA WebSocket conectado: ${key}`);
        };

        ws.onmessage = async (event) => {
            const data = JSON.parse(event.data as string);

            if (data.type === "auth_required") {
                ws.send(JSON.stringify({ type: "auth", access_token: token }));
            } else if (data.type === "auth_ok") {
                const nonDuplicatedSubs = subs.filter(
                    (sub, index, arr) =>
                        index === arr.findIndex((s) => s.eventType === sub.eventType),
                );
                for (const sub of nonDuplicatedSubs) {
                    const msg: Record<string, unknown> = {
                        id: nextId++,
                        type: "subscribe_events",
                    };
                    if (sub.eventType) msg.event_type = sub.eventType;
                    ws.send(JSON.stringify(msg));
                }
            } else if (data.type === "event") {
                const matchingSubs = subs.filter((sub) => {
                    if (sub.entityId) {
                        if (sub.eventType === "state_changed") {
                            return data.event?.data?.entity_id === sub.entityId;
                        }
                        return data.event?.data?.entity_id === sub.entityId;
                    }
                    return true;
                });
                await Promise.all(
                    matchingSubs.map(async (sub) => {
                        const traceId = crypto.randomUUID();
                        await startTracer({
                            inputData: {
                                subs: sub,
                                event: data.event,
                            },
                            traceId,
                            triggerId: sub.triggerId,
                            workflowType: "Home Assistant",
                        });
                        let status: TracerStatus = "SUCCESS";
                        try {
                            await sub.call(data.event, traceId);
                        } catch (error: unknown) {
                            status = "ERROR";
                            await addTracerEvent({
                                eventData: error as object,
                                eventName: "Home Assistant on Error",
                                eventType: "ERROR",
                                traceId,
                            });
                        } finally {
                            await endTracer({
                                outputData: {},
                                status,
                                traceId,
                            });
                        }
                    }),
                );
            } else if (data.type === "auth_invalid") {
                console.error(`HA auth inválida para ${key}: ${data.message}`);
            }
        };

        ws.onerror = (error) => {
            console.debug(`Erro HA WebSocket: ${key}`, error);
        };

        ws.onclose = () => {
            console.debug(`HA WebSocket desconectado: ${key}`);
        };

        process.on("SIGTERM", () => ws.close());
        process.on("SIGKILL", () => ws.close());
    }
}
