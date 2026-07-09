import { instrumentableFetch } from "instrumentation";
import type { SchedulledRequest } from "./types";
import { buildHttpSchedullerUrl, getHttpSchedullerAccessToken } from "./common";

export async function schedulleRequests(schedulledRequests: SchedulledRequest[], traceId: string) {
    const accessToken = await getHttpSchedullerAccessToken(traceId);
    const url = buildHttpSchedullerUrl().toString();
    const headers = {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
    };
    const response = await instrumentableFetch(traceId, url, {
        method: "POST",
        headers,
        body: JSON.stringify(schedulledRequests),
    });
    if (!response.ok) throw new Error(`Failed to schedulle requests: ${response.statusText}`);
    return;
}
