import type { SchedulledRequest } from "./types";
import { getClient } from "./common";

export async function listSchedullersRequest(traceId: string): Promise<SchedulledRequest[]> {
    const client = await getClient(traceId);
    const response = await client.api.schedulled_requests.get();

    if (response.error) throw new Error(`Failed to fetch schedullers: ${response.error}`);

    return response.data;
}
