import { instrumentableFetch } from "instrumentation";
import type { SchedulledRequest } from "./types";

export async function schedulleRequests(
    schedulledRequests: SchedulledRequest[],
    accessToken: string,
    traceId: string,
) {
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
    return await response.json();
}
