import { type BulbType, detectBulbType } from "utils/tuya/capabilities";
import { getDiscovered } from "utils/tuya/discoveryCache";
import { type Device, revealLocalKey, saveDetectedProfile } from "utils/tuya/devices";
import { TuyaLocalDevice } from "utils/tuya/protocol/device";
import { TuyaLocalKeyError } from "utils/tuya/protocol/session";
import {
    TUYA_PROTOCOL_VERSIONS,
    type TuyaDps,
    type TuyaProtocolVersion,
} from "utils/tuya/protocol/types";

/** Newest firmware first: most lamps in use today speak 3.3 or 3.5. */
const PROBE_ORDER: TuyaProtocolVersion[] = ["3.3", "3.4", "3.5", "3.1"];

export interface DeviceProfile {
    ip: string;
    protocolVersion: TuyaProtocolVersion;
    bulbType: BulbType | null;
}

export interface ProbeResult extends DeviceProfile {
    dps: TuyaDps;
}

export function resolveIp(device: Device): string | null {
    return device.ip ?? getDiscovered(device.tuyaDeviceId)?.ip ?? null;
}

/**
 * Figures out which protocol a device speaks and which data point layout it uses, by
 * connecting and reading its data points. The UDP broadcast usually tells us the version
 * outright; otherwise every version is tried in turn.
 */
export async function probeDevice(device: Device): Promise<ProbeResult> {
    const ip = resolveIp(device);
    if (!ip) {
        throw new Error(
            `No IP known for device "${device.name}". Set one manually or wait for the next discovery sweep.`,
        );
    }

    const key = await revealLocalKey(device);
    const candidates = orderedCandidates(device);

    let lastError: unknown = null;

    for (const version of candidates) {
        const socket = new TuyaLocalDevice({ id: device.tuyaDeviceId, key, ip, version });
        socket.on("error", () => undefined); // probing failures are expected; surfaced below

        try {
            await socket.connect();
            const dps = await socket.get();
            const bulbType = detectBulbType(dps);
            if (!bulbType) {
                throw new Error(
                    `Device answered on ${version} but reported no recognisable device data points: ${JSON.stringify(dps)}`,
                );
            }

            await saveDetectedProfile(device.id, version, bulbType);
            return { ip, protocolVersion: version, bulbType, dps };
        } catch (error) {
            lastError = error;
            // A rejected handshake is conclusive: the key is wrong, so other versions
            // will fail the same way.
            if (error instanceof TuyaLocalKeyError) throw error;
        } finally {
            socket.disconnect();
        }
    }

    throw new Error(
        `Could not talk to device "${device.name}" at ${ip} on any protocol version (${candidates.join(", ")}): ${
            lastError instanceof Error ? lastError.message : String(lastError)
        }`,
    );
}

function orderedCandidates(device: Device): TuyaProtocolVersion[] {
    const hinted = device.protocolVersion ?? getDiscovered(device.tuyaDeviceId)?.version ?? null;
    if (!hinted) return PROBE_ORDER;
    return [hinted, ...PROBE_ORDER.filter((version) => version !== hinted)];
}

export { TUYA_PROTOCOL_VERSIONS };
