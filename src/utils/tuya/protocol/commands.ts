import { type TuyaDps, type TuyaProtocolVersion, usesSessionKey } from "./types";

export const TuyaCommand = {
    SESS_KEY_NEG_START: 0x03,
    SESS_KEY_NEG_RESP: 0x04,
    SESS_KEY_NEG_FINISH: 0x05,
    CONTROL: 0x07,
    STATUS: 0x08,
    HEART_BEAT: 0x09,
    DP_QUERY: 0x0a,
    CONTROL_NEW: 0x0d,
    DP_QUERY_NEW: 0x10,
    UPDATEDPS: 0x12,
} as const;

export type TuyaCommandCode = (typeof TuyaCommand)[keyof typeof TuyaCommand];

/**
 * Commands that never carry the `"3.x" + 12 zero bytes` version header, on any protocol
 * version. Everything else gets it — in the clear for 3.2/3.3, inside the ciphertext for
 * 3.4/3.5, and never at all for 3.1.
 */
const COMMANDS_WITHOUT_VERSION_HEADER = new Set<number>([
    TuyaCommand.DP_QUERY,
    TuyaCommand.DP_QUERY_NEW,
    TuyaCommand.UPDATEDPS,
    TuyaCommand.HEART_BEAT,
    TuyaCommand.SESS_KEY_NEG_START,
    TuyaCommand.SESS_KEY_NEG_RESP,
    TuyaCommand.SESS_KEY_NEG_FINISH,
]);

export function needsVersionHeader(version: TuyaProtocolVersion, command: number): boolean {
    if (version === "3.1") return false;
    return !COMMANDS_WITHOUT_VERSION_HEADER.has(command);
}

/** `"3.x"` followed by 12 zero bytes, for a total of 15. */
export function buildVersionHeader(version: TuyaProtocolVersion): Buffer {
    return Buffer.concat([Buffer.from(version, "ascii"), Buffer.alloc(12)]);
}

export function statusCommandFor(version: TuyaProtocolVersion): number {
    return usesSessionKey(version) ? TuyaCommand.DP_QUERY_NEW : TuyaCommand.DP_QUERY;
}

export function controlCommandFor(version: TuyaProtocolVersion): number {
    return usesSessionKey(version) ? TuyaCommand.CONTROL_NEW : TuyaCommand.CONTROL;
}

function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

export function buildStatusPayload(version: TuyaProtocolVersion, deviceId: string): object {
    if (usesSessionKey(version)) return {};
    return { gwId: deviceId, devId: deviceId, uid: deviceId, t: String(nowSeconds()) };
}

export function buildControlPayload(
    version: TuyaProtocolVersion,
    deviceId: string,
    dps: TuyaDps,
): object {
    if (usesSessionKey(version)) {
        return { protocol: 5, t: nowSeconds(), data: { dps } };
    }
    return { devId: deviceId, uid: deviceId, t: String(nowSeconds()), dps };
}

/**
 * Pulls the dps map out of a decoded response. Devices answer DP_QUERY with `{dps: {...}}`,
 * but 3.4/3.5 wrap pushed updates in `{protocol, t, data: {dps: {...}}}`.
 */
export function extractDps(payload: unknown): TuyaDps | null {
    if (typeof payload !== "object" || payload === null) return null;
    const record = payload as Record<string, unknown>;

    if (typeof record.dps === "object" && record.dps !== null) return record.dps as TuyaDps;

    if (typeof record.data === "object" && record.data !== null) {
        const data = record.data as Record<string, unknown>;
        if (typeof data.dps === "object" && data.dps !== null) return data.dps as TuyaDps;
    }

    return null;
}
