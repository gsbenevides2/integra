import type { LatestRouterStatus } from "./types";
import { getTPLinkClient } from "./common";

export async function getLatestRouterStatus(traceId: string): Promise<LatestRouterStatus> {
    const client = await getTPLinkClient(traceId);
    const response = await client.api.settings["latest-router-status"].get();

    if (response.error) throw new Error(`Failed to fetch latest router status: ${response.error}`);

    return response.data;
}
