import { instrumentableFetch } from "instrumentation";
import { buildHaPlusServiceUrl, getHaPlusAccessToken } from "./utils";

export interface TrainToSend {
    codigo: number;
    cor: string;
    situacao: string;
    status: string;
    descricao?: string;
}

export async function sendTrainUpdates(status: TrainToSend[], traceId: string) {
    const token = await getHaPlusAccessToken(traceId);
    const url = buildHaPlusServiceUrl("/api/train");
    const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };
    const body = JSON.stringify(status);
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
