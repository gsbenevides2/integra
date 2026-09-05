import type { DeviceHistoryEntry } from "./types";
import { getTPLinkClient } from "./common";

interface Params {
    from: number;
    to: number;
}

export async function getDeviceHistory(
    deviceId: string,
    params: Params,
    traceId: string,
): Promise<DeviceHistoryEntry[]> {
    const client = await getTPLinkClient(traceId);
    const response = await client.api.devices({ id: deviceId }).history.get({ query: params });

    if (response.error) throw new Error(`Failed to fetch device history: ${response.error}`);

    return response.data;
}
