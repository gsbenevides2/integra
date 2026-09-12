export const TUYA_PROTOCOL_VERSIONS = ["3.1", "3.3", "3.4", "3.5"] as const;

export type TuyaProtocolVersion = (typeof TUYA_PROTOCOL_VERSIONS)[number];

export const TUYA_DEFAULT_PORT = 6668;

/** Data points keyed by their numeric index, as the device reports them. */
export type TuyaDps = Record<string, unknown>;

export function isTuyaProtocolVersion(value: unknown): value is TuyaProtocolVersion {
    return TUYA_PROTOCOL_VERSIONS.includes(value as TuyaProtocolVersion);
}

/** Versions that negotiate a session key instead of using the static local key. */
export function usesSessionKey(version: TuyaProtocolVersion): boolean {
    return version === "3.4" || version === "3.5";
}
