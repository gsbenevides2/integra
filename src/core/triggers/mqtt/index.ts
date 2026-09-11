import mqtt from "mqtt";
import type { Trigger, TriggerSettings } from "core/triggers";
import type { BrokerKey } from "./types";
import { brokerSettings } from "./brokers";
import { startTracer, addTracerEvent, endTracer, serializeError } from "core/instrumentation";
import type { TracerStatus } from "core/instrumentation/types";

export interface MqttSettings extends TriggerSettings {
    broker: BrokerKey;
    topic: string;
    qos?: 0 | 1 | 2;
}

export interface MqttSubscription {
    broker: BrokerKey;
    topic: string;
    qos: 0 | 1 | 2;
    call: MqttCall;
    triggerId: string;
}

export interface MqttTrigger extends Trigger {}

export type MqttCall = (message: Buffer, topic: string, traceId: string) => Promise<void>;

declare global {
    var mqttClients: Map<BrokerKey, mqtt.MqttClient> | undefined;
    var mqttSubscriptions: MqttSubscription[] | undefined;
    var lastSubId: number | undefined;
}

export default function onMqtt(settings: MqttSettings, func: MqttCall): MqttTrigger {
    return {
        id: settings.id,
        register: async () => {
            if (!global.mqttClients) global.mqttClients = new Map();
            const hasClient = global.mqttClients.has(settings.broker);
            const { url, password, username } = brokerSettings[settings.broker];
            if (!hasClient)
                global.mqttClients.set(
                    settings.broker,
                    mqtt.connect(url, {
                        manualConnect: true,
                        username,
                        password,
                    }),
                );

            if (!global.mqttSubscriptions) global.mqttSubscriptions = [];

            const hasOtherQOS = global.mqttSubscriptions.find(
                (sub) => sub.broker === settings.broker && sub.topic === settings.topic,
            )?.qos;
            const currentQOS = settings.qos ?? 0;

            if (hasOtherQOS !== undefined && hasOtherQOS !== currentQOS)
                throw new Error(
                    "Its not possible to register trigger to this broker beause has other triger with QOS: " +
                        String(hasOtherQOS),
                );

            global.mqttSubscriptions = [
                ...global.mqttSubscriptions,
                {
                    broker: settings.broker,
                    call: func,
                    qos: currentQOS,
                    topic: settings.topic,
                    triggerId: settings.id,
                },
            ];
        },
    };
}

export async function startMqttClients() {
    if (!global.mqttClients) return;
    for (const [key, client] of global.mqttClients) {
        if (!global.mqttSubscriptions) return;
        const subs = global.mqttSubscriptions.filter((sub) => sub.broker === key);

        client.on("connect", () => {
            const nonDuplicatedSub = subs.filter(
                (sub, index, arr) =>
                    index === arr.findIndex((findSub) => findSub.topic === sub.topic),
            );
            for (const sub of nonDuplicatedSub) {
                client.subscribe(sub.topic, { qos: sub.qos });
            }
        });

        client.on("message", async (topic, message) => {
            const topicSubs = subs.filter((sub) => sub.topic === topic);
            await Promise.all(
                topicSubs.map(async (sub) => {
                    const traceId = crypto.randomUUID();
                    await startTracer({
                        inputData: {
                            subs: sub,
                            message,
                            topic,
                        },
                        traceId,
                        triggerId: sub.triggerId,
                        workflowType: "MQTT",
                    });
                    let status: TracerStatus = "SUCCESS";
                    try {
                        await sub.call(message, topic, traceId);
                    } catch (error: unknown) {
                        status = "ERROR";
                        await addTracerEvent({
                            eventData: serializeError(error),
                            eventName: "MQTT on Error",
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
        });

        client.on("error", (error) => {
            console.debug(`Erro mqtt: ${key}`, error);
        });
        process.on("SIGTERM", () => client.end());
        process.on("SIGKILL", () => client.end());
        client.connect();
    }
}
