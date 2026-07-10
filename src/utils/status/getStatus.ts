import { instrumentableFetch } from "instrumentation";
import { buildPlataformStatusUrl, getStatusAccessToken } from "./common";

interface ReceivedStatusPlataform {
    name: string;
    status: string;
    statusPage: string;
    problemDescription: string;
}

export async function getStatusOfPlataforms(traceId: string) {
    const access_token = await getStatusAccessToken(traceId);
    const url = buildPlataformStatusUrl("/api/platform/status");
    console.debug("Fetching status from: ", url);
    const response = await instrumentableFetch(traceId, url, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${access_token}`,
        },
    });
    return (await response.json()) as ReceivedStatusPlataform[];
}
