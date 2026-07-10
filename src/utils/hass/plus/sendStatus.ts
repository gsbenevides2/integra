import { instrumentableFetch } from "instrumentation";
import { buildHaPlusServiceUrl, getHaPlusAccessToken } from "./utils";

export interface StatusPlataform {
    hasProblem: boolean;
    name: string;
    status_url: string;
    problem_description: string;
}

export async function sendStatusUpdates(plataforms: StatusPlataform[], traceId: string) {
    const token = await getHaPlusAccessToken(traceId);
    const url = buildHaPlusServiceUrl("/api/status");
    const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };
    const body = JSON.stringify(plataforms);
    const response = await instrumentableFetch(traceId, url, {
        method: "POST",
        headers: headers,
        body: body,
    });
    if (!response.ok) {
        console.log(await response.text());
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return null;
}
