import { instrumentableFetch } from "core/instrumentation";
import { TRAIN_LINES } from "../constants";
import { getTrainLineStatus } from "../statusClassifier";
import type { ProcessedTrainLine } from "../types";
import type { TICOwnerLineResponse } from "./types";

const TIC_OWNER_LINE_STATUSES_URL = "https://www.tictrens.com.br/helper/owner-line-statuses";

async function fetchTICOwnerLineStatuses(traceId: string): Promise<TICOwnerLineResponse> {
    const response = await instrumentableFetch(traceId, TIC_OWNER_LINE_STATUSES_URL, {
        cache: "no-store",
    });
    return (await response.json()) as TICOwnerLineResponse;
}

export async function processTICLines(traceId: string): Promise<ProcessedTrainLine[]> {
    const line = TRAIN_LINES.find((line) => line.company === "tic");
    const data = await fetchTICOwnerLineStatuses(traceId);
    const firstItem = data.data[0];

    return [
        {
            codigo: line?.code ?? 0,
            cor: line?.color ?? "",
            situacao: firstItem?.status.name ?? "",
            status: getTrainLineStatus(firstItem?.status.name ?? ""),
            descricao: firstItem?.description ?? "",
        },
    ];
}
