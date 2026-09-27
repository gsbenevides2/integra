import safeEnvGet from "@server/safeEnvGet";

import { TuyaContext } from "@tuya/tuya-connector-nodejs";

import { fetchRpc } from "./fetchRpc";

/** Data centre hosts, keyed by the short name shown on the Tuya IoT platform. */
const DATA_CENTERS = {
  us: "https://openapi.tuyaus.com",
  eu: "https://openapi.tuyaeu.com",
  cn: "https://openapi.tuyacn.com",
  in: "https://openapi.tuyain.com",
} as const;

export type TuyaDataCenter = keyof typeof DATA_CENTERS;

function baseUrl(): string {
  const configured = process.env.TUYA_DATA_CENTER ?? "us";
  const host = DATA_CENTERS[configured as TuyaDataCenter];
  if (!host) {
    throw new Error(
      `Unknown TUYA_DATA_CENTER "${configured}", expected one of ${Object.keys(DATA_CENTERS).join(", ")}`,
    );
  }
  return host;
}

const tuya = new TuyaContext({
  baseUrl: baseUrl(),
  accessKey: safeEnvGet("TUYA_ACCESS_ID"),
  secretKey: safeEnvGet("TUYA_ACCESS_SECRET"),
  rpc: fetchRpc as unknown as ConstructorParameters<
    typeof TuyaContext
  >[0]["rpc"],
});

export interface TuyaCloudDevice {
  id: string;
  name: string;
  category: string;
  product_id?: string;
  product_name: string;
  online: boolean;
  ip?: string;
}

export interface TuyaStatusEntry {
  code: string;
  value: string | number | boolean;
}

export interface TuyaCommand {
  code: string;
  value: string | number | boolean | object;
}

interface TuyaEnvelope<T> {
  success: boolean;
  code?: number;
  msg?: string | null;
  result: T;
}

/**
 * `TuyaContext.request`/the typed service helpers all just unwrap `.data` and hand it back
 * verbatim — a `{ success: false, msg: "..." }` response is not rejected, it's returned as
 * a normal value. Every call in this file goes through this so a failed request throws
 * instead of silently looking like it worked.
 */
function unwrap<T>(envelope: TuyaEnvelope<T>): T {
  if (!envelope.success) {
    throw new Error(`Tuya API call failed: [${envelope.code}] ${envelope.msg}`);
  }
  return envelope.result;
}

/**
 * One call covers every device, which keeps calls well inside the API rate limits.
 *
 * Deliberately bypasses `tuya.deviceStatus.statusList` — that typed helper serializes
 * `device_ids` as `qs` array brackets (`device_ids[0]=...`), which the endpoint doesn't
 * recognise and answers with "device_ids param is empty". The comma-joined query string
 * Tuya actually expects has to be built by hand and passed through the generic `request`.
 */
export async function getDevicesStatus(
  deviceIds: string[],
): Promise<Map<string, TuyaStatusEntry[]>> {
  if (deviceIds.length === 0) return new Map();

  const result = unwrap(
    await tuya.request<{ id: string; status: TuyaStatusEntry[] }[]>({
      path: `/v1.0/iot-03/devices/status?device_ids=${deviceIds.join(",")}`,
      method: "GET",
    }),
  );
  return new Map(result.map((entry) => [entry.id, entry.status]));
}

/**
 * Sends data point commands through the cloud.
 *
 * Deliberately bypasses `tuya.deviceFunction.command` — that typed helper is simply broken
 * in `@tuya/tuya-connector-nodejs@2.1.2`: it issues a bodiless `GET` against the `commands`
 * endpoint instead of a `POST` carrying `{ commands }`, so every call answers
 * `[1108] uri path invalid` while looking like a normal response (see `unwrap`). The generic
 * `request` with the method and body built by hand is what actually reaches the device.
 */
export async function sendDeviceCommands(
  deviceId: string,
  commands: TuyaCommand[],
): Promise<void> {
  unwrap(
    await tuya.request<boolean>({
      path: `/v1.0/iot-03/devices/${deviceId}/commands`,
      method: "POST",
      body: { commands },
    }),
  );
}

export async function getDeviceStatus(
  deviceId: string,
): Promise<TuyaStatusEntry[]> {
  const statuses = await getDevicesStatus([deviceId]);
  return statuses.get(deviceId) ?? [];
}

export async function getDeviceDetail(
  deviceId: string,
): Promise<TuyaCloudDevice> {
  return unwrap(
    await tuya.device.detail({ device_id: deviceId }),
  ) as unknown as TuyaCloudDevice;
}
