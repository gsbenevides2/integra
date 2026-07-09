import { instrumentableFetch } from "instrumentation";
import { buildHttpSchedullerUrl, getHttpSchedullerAccessToken } from "./common";

export async function deleteManySchedullerRequests(ids: string[], traceId: string) {
    const accessToken = await getHttpSchedullerAccessToken(traceId);
    const url = buildHttpSchedullerUrl().toString();
    const headers = {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
    };
    const response = await instrumentableFetch(traceId, url, {
        method: "DELETE",
        headers,
        body: JSON.stringify(ids),
    });
    if (!response.ok)
        throw new Error(
            `Failed to delete schedullers: ${response.status} ${response.statusText}  ${await response.text()}`,
        );
    return;
}
