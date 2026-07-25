import { getClient } from "./common";

export async function deleteManySchedullerRequests(ids: string[], traceId: string) {
    const client = await getClient(traceId);
    const response = await client.api.schedulled_requests.delete(ids);

    if (response.error) throw new Error(`Failed to delete schedullers: ${response.error}`);

    return response.data;
}
