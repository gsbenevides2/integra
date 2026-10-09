import { SpanKind, trace } from "@opentelemetry/api";

import { withSpan } from "../../../../instrumentation/withSpan";
import { tuyaEvents } from "../../events";
import { getDeviceStatus, type TuyaStatusEntry } from "../cloud/client";
import {
  cloudStatusToDeviceState,
  cloudStatusToSwitchState,
} from "../cloud/deviceState";
import { DeviceService } from "../devices";
import { SensorService } from "../sensors";
import { StateService } from "../state";

export interface PulsarMessage {
  messageId: string;
  payload: {
    data: Record<string, unknown>;
    protocol: number;
    pv: string;
    t: number;
  };
}

interface TuyaDeviceEvent {
  devId: string;
  bizCode?: "online" | "offline" | string;
  status?: TuyaStatusEntry[];
}

/**
 * Pulsar only reports the data points that actually changed, but `cloudStatusToDeviceState`
 * was written for the cloud's full-status REST response and treats a missing code as "this
 * device has no such capability" — so feeding it a one-field delta would wipe brightness,
 * colour and work mode back to null on every single toggle. This cache holds the fullest
 * status picture seen for each device and merges every incoming delta onto it, seeded once
 * from the cloud on first sight so a process restart doesn't start the picture over.
 */
const fullStatusByDevice = new Map<string, Map<string, TuyaStatusEntry>>();
const tracer = trace.getTracer("pulsar");

async function mergedStatus(
  tuyaDeviceId: string,
  incoming: TuyaStatusEntry[],
): Promise<TuyaStatusEntry[]> {
  let known = fullStatusByDevice.get(tuyaDeviceId);
  if (!known) {
    known = new Map();
    try {
      for (const entry of await getDeviceStatus(tuyaDeviceId)) {
        known.set(entry.code, entry);
      }
    } catch {
      // Best effort: a delta-only picture is still better than none.
    }
    fullStatusByDevice.set(tuyaDeviceId, known);
  }

  for (const entry of incoming) known.set(entry.code, entry);
  return [...known.values()];
}

async function handleDeviceReport(
  tuyaDeviceId: string,
  status: TuyaStatusEntry[],
  online: boolean,
): Promise<boolean> {
  const device = await DeviceService.getByTuyaId(tuyaDeviceId);
  if (!device) return false;

  const full = await mergedStatus(tuyaDeviceId, status);
  const state =
    device.kind === "switch"
      ? cloudStatusToSwitchState(full, online)
      : cloudStatusToDeviceState(full, online);
  await StateService.saveStateIfChanged(device, state);
  return true;
}

async function handleSensorReport(
  tuyaDeviceId: string,
  status: TuyaStatusEntry[],
): Promise<boolean> {
  const sensor = await SensorService.getByTuyaId(tuyaDeviceId);
  if (!sensor) return false;

  const detected = SensorService.kindForCodes(
    status.map((entry) => entry.code),
    sensor.kind,
  );
  if (detected !== sensor.kind)
    await SensorService.setKind(sensor.id, detected);

  const latest = await SensorService.getLatestReadings(sensor.id);
  const now = new Date();
  const readings = status
    .filter((entry) => latest[entry.code] !== String(entry.value))
    .map((entry) => ({
      sensorId: sensor.id,
      code: entry.code,
      value: String(entry.value),
      recordedAt: now,
    }));

  await SensorService.saveReadings(readings);
  if (readings.length > 0) await SensorService.setLastEventAt(sensor.id, now);
  for (const reading of readings) {
    tuyaEvents.emitSensorChange({
      sensor,
      code: reading.code,
      value: reading.value,
      previousValue: latest[reading.code] ?? null,
      at: now,
    });
  }
  return true;
}

async function handleOnlineChange(
  tuyaDeviceId: string,
  online: boolean,
): Promise<boolean> {
  const sensor = await SensorService.getByTuyaId(tuyaDeviceId);
  if (sensor) {
    await SensorService.setOnline(sensor.id, online);
    return true;
  }

  const device = await DeviceService.getByTuyaId(tuyaDeviceId);
  if (!device) return false;
  return handleDeviceReport(tuyaDeviceId, [], online);
}

export async function handlePulsarMessage(
  message: PulsarMessage,
): Promise<void> {
  const event = message.payload.data as unknown as TuyaDeviceEvent;
  if (!event.devId) return;

  await withSpan(
    tracer,
    "pulsar.message",
    {
      kind: SpanKind.CONSUMER,
      attributes: {
        "messaging.system": "tuya-pulsar",
        "messaging.operation.type": "process",
        "messaging.message.id": message.messageId,
        "tuya.dev_id": event.devId,
        ...(event.bizCode ? { "tuya.biz_code": event.bizCode } : {}),
      },
    },
    async () => {
      if (event.bizCode === "online" || event.bizCode === "offline") {
        await handleOnlineChange(event.devId, event.bizCode === "online");
      } else if (event.status && event.status.length > 0) {
        const handledAsDevice = await handleDeviceReport(
          event.devId,
          event.status,
          true,
        );
        if (!handledAsDevice)
          await handleSensorReport(event.devId, event.status);
      }
    },
  ).catch(() => {}); // already recorded on the span; one bad message must not stop the stream
}
