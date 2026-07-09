import { instrumentableFetch } from "instrumentation";
import type { SchedulledRequest } from "./types";
import { buildHttpSchedullerUrl, getHttpSchedullerAccessToken } from "./common";

export async function listSchedullersRequest(traceId: string): Promise<SchedulledRequest[]> {
    const accessToken = await getHttpSchedullerAccessToken(traceId);
    const url = buildHttpSchedullerUrl().toString();
    const headers = {
        Authorization: "Bearer " + accessToken,
    };
    const response = await instrumentableFetch(traceId, url, { headers });
    if (!response.ok) throw new Error(`Failed to fetch schedullers: ${response.statusText}`);
    return (await response.json()) as SchedulledRequest[];
}
