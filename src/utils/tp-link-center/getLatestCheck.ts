import type { LatestCheck } from "./types";
import { getTPLinkClient } from "./common";

export async function getLatestCheck(traceId: string): Promise<LatestCheck> {
    const client = await getTPLinkClient(traceId);
    const response = await client.api.checks.latest.get();

    if (response.error) throw new Error(`Failed to fetch latest check: ${response.error}`);

    return response.data;
}
