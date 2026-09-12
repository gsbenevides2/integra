import { type BulbType, detectBulbType } from "utils/tuya/capabilities";
import { getDiscovered } from "utils/tuya/discoveryCache";
import {
    type Device,
    markDeviceSeen,
    revealLocalKey,
    saveDetectedProfile,
} from "utils/tuya/devices";
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

/**
 * Every address the device might be answering on, freshest first. A broadcast is seconds
 * old while a stored address can be a DHCP lease from last week, so discovery leads — but
 * the stored address stays as a fallback, since the broadcast never reaches a host that
 * cannot see it, such as a container on a bridge network.
 */
export function resolveIpCandidates(device: Device): string[] {
    const discovered = getDiscovered(device.tuyaDeviceId)?.ip ?? null;
    return [...new Set([discovered, device.ip].filter((ip): ip is string => ip !== null))];
}

export function resolveIp(device: Device): string | null {
    return resolveIpCandidates(device)[0] ?? null;
}

/**
 * Figures out where a device is, which protocol it speaks and which data point layout it
 * uses, by connecting and reading its data points. Every candidate address is tried in
 * turn, so a device that changed address is found again rather than reported dead. The UDP
 * broadcast usually tells us the version outright; otherwise every version is tried too.
 */
export async function probeDevice(device: Device): Promise<ProbeResult> {
    const addresses = resolveIpCandidates(device);
    if (addresses.length === 0) {
        throw new Error(
            `No IP known for device "${device.name}". Set one manually or wait for the next discovery sweep.`,
        );
    }

    const key = await revealLocalKey(device);
    const versions = orderedVersions(device);

    let lastError: unknown = null;

    for (const ip of addresses) {
        for (const version of versions) {
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
                // A device that moved is only really found again once the new address is
                // stored; otherwise every later connection starts at the dead one.
                if (ip !== device.ip) await markDeviceSeen(device.id, ip);
                return { ip, protocolVersion: version, bulbType, dps };
            } catch (error) {
                lastError = error;
                // A rejected handshake is conclusive: the key is wrong, so other versions
                // and other addresses will fail the same way.
                if (error instanceof TuyaLocalKeyError) throw error;
            } finally {
                socket.disconnect();
            }
        }
    }

    throw new Error(
        `Could not talk to device "${device.name}" at ${addresses.join(", ")} on any protocol version (${versions.join(", ")}): ${
            lastError instanceof Error ? lastError.message : String(lastError)
        }`,
    );
}

function orderedVersions(device: Device): TuyaProtocolVersion[] {
    const hinted = device.protocolVersion ?? getDiscovered(device.tuyaDeviceId)?.version ?? null;
    if (!hinted) return PROBE_ORDER;
    return [hinted, ...PROBE_ORDER.filter((version) => version !== hinted)];
}

export { TUYA_PROTOCOL_VERSIONS };
