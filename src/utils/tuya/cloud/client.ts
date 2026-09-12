import { createHash, createHmac } from "node:crypto";
import { instrumentableFetch } from "core/instrumentation";
import safeEnvGet from "utils/safeEnvGet";

/** Data centre hosts, keyed by the short name shown on the Tuya IoT platform. */
const DATA_CENTERS = {
    us: "https://openapi.tuyaus.com",
    eu: "https://openapi.tuyaeu.com",
    cn: "https://openapi.tuyacn.com",
    in: "https://openapi.tuyain.com",
} as const;

export type TuyaDataCenter = keyof typeof DATA_CENTERS;

const EMPTY_BODY_SHA256 = createHash("sha256").update("").digest("hex");

/** Refresh a little before the real expiry so an in-flight request never races it. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

interface CachedToken {
    accessToken: string;
    expiresAt: number;
}

let cachedToken: CachedToken | null = null;
let inFlightToken: Promise<string> | null = null;

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

/**
 * Query parameters have to appear in alphabetical order in the signed string, even though
 * the request itself may send them in any order. Signing the unsorted path is rejected
 * with a bare "sign invalid".
 */
function canonicalPath(path: string): string {
    const [pathname, query] = path.split("?");
    if (!query) return pathname!;
    return `${pathname}?${query.split("&").sort().join("&")}`;
}

function signRequest(
    method: string,
    path: string,
    timestamp: string,
    accessToken: string,
    body?: string,
): string {
    const bodyHash = body ? createHash("sha256").update(body).digest("hex") : EMPTY_BODY_SHA256;
    const stringToSign = [method, bodyHash, "", canonicalPath(path)].join("\n");
    const payload = safeEnvGet("TUYA_ACCESS_ID") + accessToken + timestamp + "" + stringToSign;
    return createHmac("sha256", safeEnvGet("TUYA_ACCESS_SECRET"))
        .update(payload, "utf8")
        .digest("hex")
        .toUpperCase();
}

interface TuyaResponse<T> {
    success: boolean;
    code?: number;
    msg?: string;
    result?: T;
}

async function rawRequest<T>(
    path: string,
    traceId: string,
    accessToken = "",
    requestBody?: object,
): Promise<T> {
    const timestamp = Date.now().toString();
    const method = requestBody ? "POST" : "GET";
    const serialized = requestBody ? JSON.stringify(requestBody) : undefined;

    const headers: Record<string, string> = {
        client_id: safeEnvGet("TUYA_ACCESS_ID"),
        t: timestamp,
        sign_method: "HMAC-SHA256",
        sign: signRequest(method, path, timestamp, accessToken, serialized),
    };
    if (accessToken) headers.access_token = accessToken;
    if (serialized) headers["Content-Type"] = "application/json";

    const response = await instrumentableFetch(traceId, baseUrl() + canonicalPath(path), {
        method,
        headers,
        body: serialized,
    });
    const body = (await response.json()) as TuyaResponse<T>;

    if (!body.success) {
        throw new Error(`Tuya API ${path} failed: [${body.code}] ${body.msg}`);
    }
    return body.result as T;
}

interface TokenResult {
    access_token: string;
    expire_time: number;
    uid: string;
}

async function fetchToken(traceId: string): Promise<string> {
    const result = await rawRequest<TokenResult>("/v1.0/token?grant_type=1", traceId);
    cachedToken = {
        accessToken: result.access_token,
        expiresAt: Date.now() + result.expire_time * 1000 - TOKEN_EXPIRY_MARGIN_MS,
    };
    return result.access_token;
}

/** Returns a valid token, collapsing concurrent callers onto a single refresh. */
export async function getAccessToken(traceId: string): Promise<string> {
    if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.accessToken;

    inFlightToken ??= fetchToken(traceId).finally(() => {
        inFlightToken = null;
    });
    return inFlightToken;
}

export async function tuyaCloudGet<T>(path: string, traceId: string): Promise<T> {
    return rawRequest<T>(path, traceId, await getAccessToken(traceId));
}

export async function tuyaCloudPost<T>(path: string, body: object, traceId: string): Promise<T> {
    return rawRequest<T>(path, traceId, await getAccessToken(traceId), body);
}

export interface TuyaCloudDevice {
    id: string;
    name: string;
    category: string;
    product_id?: string;
    product_name: string;
    local_key: string;
    online: boolean;
    sub: boolean;
    ip?: string;
}

export interface TuyaStatusEntry {
    code: string;
    value: string | number | boolean;
}

export interface TuyaLogEntry {
    code: string;
    value: string;
    event_time: number;
}

export async function listAccountDevices(traceId: string): Promise<TuyaCloudDevice[]> {
    const result = await tuyaCloudGet<{ devices?: TuyaCloudDevice[] } | TuyaCloudDevice[]>(
        "/v1.0/iot-01/associated-users/devices?size=100",
        traceId,
    );
    if (Array.isArray(result)) return result;
    return result.devices ?? [];
}

/** One call covers every device, which keeps the polling well inside the API rate limits. */
export async function getDevicesStatus(
    deviceIds: string[],
    traceId: string,
): Promise<Map<string, TuyaStatusEntry[]>> {
    if (deviceIds.length === 0) return new Map();

    const result = await tuyaCloudGet<Record<string, TuyaStatusEntry[]>>(
        `/v1.0/devices/status?device_ids=${deviceIds.join(",")}`,
        traceId,
    );
    return new Map(Object.entries(result));
}

/**
 * Reports every data point change the device made in a window, with the device's own
 * millisecond timestamps. This is what makes polling safe for door and motion sensors: a
 * contact that opens and closes between two polls still shows up here.
 */
export async function getDeviceLogs(
    deviceId: string,
    from: Date,
    to: Date,
    traceId: string,
    size = 100,
): Promise<TuyaLogEntry[]> {
    const path =
        `/v1.0/devices/${deviceId}/logs` +
        `?end_time=${to.getTime()}&size=${size}&start_time=${from.getTime()}&type=7`;
    const result = await tuyaCloudGet<{ logs?: TuyaLogEntry[] }>(path, traceId);
    return result.logs ?? [];
}

export interface TuyaCommand {
    code: string;
    value: string | number | boolean | object;
}

/** Sends data point commands through the cloud, for devices the LAN cannot reach. */
export async function sendDeviceCommands(
    deviceId: string,
    commands: TuyaCommand[],
    traceId: string,
): Promise<void> {
    await tuyaCloudPost(`/v1.0/devices/${deviceId}/commands`, { commands }, traceId);
}

export async function getDeviceStatus(
    deviceId: string,
    traceId: string,
): Promise<TuyaStatusEntry[]> {
    const statuses = await getDevicesStatus([deviceId], traceId);
    return statuses.get(deviceId) ?? [];
}

export async function getDeviceDetail(deviceId: string, traceId: string): Promise<TuyaCloudDevice> {
    return tuyaCloudGet<TuyaCloudDevice>(`/v1.0/devices/${deviceId}`, traceId);
}

export interface TuyaThingProperty {
    code: string;
    value: string | number | boolean;
    /** When the device last changed this property, in milliseconds. */
    time: number;
    dp_id: number;
    type: string;
}

/**
 * Reads the "thing model" properties. Devices whose data points sit outside the standard
 * instruction set — custom dp ids of 101 and up, which is how most PIR sensors are built —
 * report nothing through `/v1.0/devices/{id}/status` but show up in full here.
 */
export async function getThingProperties(
    deviceId: string,
    traceId: string,
): Promise<TuyaThingProperty[]> {
    const result = await tuyaCloudGet<{ properties?: TuyaThingProperty[] }>(
        `/v2.0/cloud/thing/${deviceId}/shadow/properties`,
        traceId,
    );
    return result.properties ?? [];
}
