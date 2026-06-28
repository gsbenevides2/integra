import { RedisClient } from "bun";
import type { Trigger, TriggerSettings } from "triggers";
import type { RedisInstanceKey } from "./types";
import { redisInstanceSettings } from "./instances";
import { startTracer, addTracerEvent, endTracer } from "instrumentation";
import type { TracerStatus } from "instrumentation/types";

export interface RedisSettings extends TriggerSettings {
    instance: RedisInstanceKey;
    channel: string;
}

export interface RedisSubscription {
    instance: RedisInstanceKey;
    channel: string;
    call: RedisCall;
    triggerId: string;
}

export interface RedisTrigger extends Trigger {}

export type RedisCall = (message: string, channel: string, traceId: string) => Promise<void>;

declare global {
    var redisClients: Map<RedisInstanceKey, RedisClient> | undefined;
    var redisSubscriptions: RedisSubscription[] | undefined;
}

export default function onRedis(settings: RedisSettings, func: RedisCall): RedisTrigger {
    return {
        id: settings.id,
        register: async () => {
            if (!global.redisSubscriptions) global.redisSubscriptions = [];

            global.redisSubscriptions = [
                ...global.redisSubscriptions,
                {
                    instance: settings.instance,
                    channel: settings.channel,
                    call: func,
                    triggerId: settings.id,
                },
            ];
        },
    };
}

export async function startRedisClients() {
    if (!global.redisSubscriptions) return;

    for (const [key, config] of Object.entries(redisInstanceSettings)) {
        const instanceKey = key as RedisInstanceKey;
        const subs = global.redisSubscriptions.filter((sub) => sub.instance === instanceKey);
        if (subs.length === 0) continue;

        const client = new RedisClient(config.url);

        if (!global.redisClients) global.redisClients = new Map();
        global.redisClients.set(instanceKey, client);

        client.onconnect = () => {
            console.debug(`Redis conectado: ${key}`);
        };

        client.onclose = (error) => {
            console.debug(`Redis desconectado: ${key}`, error);
        };

        await client.connect();

        const nonDuplicatedChannels = subs.filter(
            (sub, index, arr) => index === arr.findIndex((s) => s.channel === sub.channel),
        );

        for (const sub of nonDuplicatedChannels) {
            await client.subscribe(sub.channel, async (message, channel) => {
                const channelSubs = subs.filter((s) => s.channel === channel);
                await Promise.all(
                    channelSubs.map(async (s) => {
                        const traceId = crypto.randomUUID();
                        await startTracer({
                            inputData: {
                                subs: sub,
                                message,
                                channel,
                            },
                            traceId,
                            triggerId: sub.triggerId,
                            workflowType: "Redis",
                        });
                        let status: TracerStatus = "SUCCESS";
                        try {
                            await s.call(message, channel, traceId);
                        } catch (error: unknown) {
                            status = "ERROR";
                            await addTracerEvent({
                                eventData: error as object,
                                eventName: "Redis on Error",
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
        }

        process.on("SIGTERM", () => client.close());
        process.on("SIGKILL", () => client.close());
    }
}
