import safeEnvGet from "@server/safeEnvGet";

import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";

import TuyaMessageSubscribeWebsocket from "./client";
import { TUYA_PASULAR_ENV, TuyaRegionConfigEnum } from "./config";
import { handlePulsarMessage, type PulsarMessage } from "./handler";

const REGIONS = {
  us: TuyaRegionConfigEnum.US,
  eu: TuyaRegionConfigEnum.EU,
  cn: TuyaRegionConfigEnum.CN,
  in: TuyaRegionConfigEnum.IN,
} as const;

const tracer = trace.getTracer("pulsar");

function recordEvent(name: string, attributes?: Record<string, string>): void {
  tracer.startSpan(name, { kind: SpanKind.INTERNAL, attributes }).end();
}

function recordError(name: string, error: unknown): void {
  const span = tracer.startSpan(name, { kind: SpanKind.INTERNAL });
  const err = error instanceof Error ? error : new Error(String(error));
  span.recordException(err);
  span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
  span.end();
}

/** Starts the Tuya Pulsar (real-time push) connection once for the whole app lifetime. */
export function startTuyaPulsar(): void {
  const region =
    REGIONS[(process.env.TUYA_DATA_CENTER as keyof typeof REGIONS) ?? "us"];

  const client = new TuyaMessageSubscribeWebsocket({
    accessId: safeEnvGet("TUYA_ACCESS_ID"),
    accessKey: safeEnvGet("TUYA_ACCESS_SECRET"),
    url: region,
    env:
      process.env.TUYA_PULSAR_ENV === "test"
        ? TUYA_PASULAR_ENV.TEST
        : TUYA_PASULAR_ENV.PROD,
    maxRetryTimes: 100,
    logger: (level, ...args) => {
      const [, ...info] = args;
      if (level === "ERROR") recordError("pulsar.log", info[0]);
      else recordEvent("pulsar.log", { "log.message": info.map(String).join(" ") });
    },
  });

  client.open(() => recordEvent("pulsar.connected"));
  client.reconnect(() => recordEvent("pulsar.reconnected"));

  client.message((_ws, raw) => {
    const message = raw as PulsarMessage;
    client.ackMessage(message.messageId);
    void handlePulsarMessage(message);
  });

  client.error((_ws, error) => recordError("pulsar.error", error));

  client.start();
}
