import type { AddSchedulledRequest } from "./types";
import { getClient } from "./common";

export async function schedulleRequests(
    schedulledRequests: AddSchedulledRequest[],
    traceId: string,
) {
    const client = await getClient(traceId);
    const response = await client.api.schedulled_requests.post(schedulledRequests);

    if (response.error) throw new Error(`Failed to fetch schedullers: ${response.error}`);

    return response.data;
}
