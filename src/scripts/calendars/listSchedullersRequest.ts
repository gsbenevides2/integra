import { instrumentableFetch } from "instrumentation";
import type { SchedulledRequest } from "./types";

export async function listSchedullersRequest(
    accessToken: string,
    traceId: string,
): Promise<SchedulledRequest[]> {
    const url = "https://http-scheduller.local.gui.dev.br/api/http-scheduller";
    const headers = {
        Authorization: "Bearer " + accessToken,
    };
    const response = await instrumentableFetch(traceId, url, { headers });
    if (!response.ok) throw new Error(`Failed to fetch schedullers: ${response.statusText}`);
    return (await response.json()) as SchedulledRequest[];
}
