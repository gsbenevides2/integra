import { instrumentableFetch } from "core/instrumentation";
import { buildTrainStatusUrl, getStatusAccessToken } from "./common";
import type { TrainStatusPlataform } from "./types";

export async function getTrainStatus(traceId: string) {
    const access_token = await getStatusAccessToken(traceId);
    const url = buildTrainStatusUrl("/api/processed-data");
    const response = await instrumentableFetch(traceId, url, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${access_token}`,
        },
    });
    return (await response.json()) as TrainStatusPlataform[];
}
