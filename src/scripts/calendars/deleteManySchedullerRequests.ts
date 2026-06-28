import { instrumentableFetch } from "instrumentation";

export async function deleteManySchedullerRequests(
    ids: string[],
    accessToken: string,
    traceId: string,
) {
    const url = "https://http-scheduller.local.gui.dev.br/api/http-scheduller";
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
    return await response.json();
}
