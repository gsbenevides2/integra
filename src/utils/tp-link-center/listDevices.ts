import type { Device } from "./types";
import { getTPLinkClient } from "./common";

export async function listDevices(traceId: string): Promise<Device[]> {
    const client = await getTPLinkClient(traceId);
    const response = await client.api.devices.get();

    if (response.error) throw new Error(`Failed to fetch devices: ${response.error}`);

    return response.data;
}
