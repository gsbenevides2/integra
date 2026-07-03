import { instrumentableFetch } from "instrumentation";
import type { SchedulledRequest } from "./types";
import { getHttpSchedullerAccessToken } from "./common";

export async function schedulleRequests(schedulledRequests: SchedulledRequest[], traceId: string) {
    const accessToken = await getHttpSchedullerAccessToken(traceId);
    const url = "https://http-scheduller.local.gui.dev.br/api/http-scheduller";
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
