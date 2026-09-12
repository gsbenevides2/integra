import { listenForDevices, type DiscoveredDevice } from "utils/tuya/protocol/discovery";

/** How long a broadcast stays trustworthy before it is treated as stale. */
const ENTRY_TTL_MS = 30 * 60 * 1000;

const cache = new Map<string, DiscoveredDevice>();

export async function refreshDiscovery(durationMs: number): Promise<DiscoveredDevice[]> {
    const devices = await listenForDevices(durationMs);
    for (const device of devices) cache.set(device.deviceId, device);
    return devices;
}

export function getDiscovered(deviceId: string): DiscoveredDevice | null {
    const entry = cache.get(deviceId);
    if (!entry) return null;
    if (Date.now() - entry.discoveredAt.getTime() > ENTRY_TTL_MS) {
        cache.delete(deviceId);
        return null;
    }
    return entry;
}

export function listDiscovered(): DiscoveredDevice[] {
    const now = Date.now();
    for (const [deviceId, entry] of cache) {
        if (now - entry.discoveredAt.getTime() > ENTRY_TTL_MS) cache.delete(deviceId);
    }
    return [...cache.values()];
}
