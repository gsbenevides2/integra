import { instrumentableFetch } from "core/instrumentation";
import { TRAIN_LINES } from "../constants";
import { getTrainLineStatus } from "../statusClassifier";
import type { ProcessedTrainLine } from "../types";
import type { LiaUniResponse } from "./types";

const LIAUNI_URL = "https://www.linhauni.com.br/api/status/linhauni";

async function fetchLiaUniLines(traceId: string): Promise<LiaUniResponse> {
    const response = await instrumentableFetch(traceId, LIAUNI_URL);
    return (await response.json()) as LiaUniResponse;
}

export async function processLiaUniLines(traceId: string): Promise<ProcessedTrainLine[]> {
    const line = TRAIN_LINES.find((line) => line.company === "liauni");
    const data = await fetchLiaUniLines(traceId);
    const firstItem = data.data.listItem[0];

    return [
        {
            codigo: line?.code ?? 0,
            cor: line?.color ?? "",
            situacao: firstItem?.status ?? "",
            status: getTrainLineStatus(firstItem?.status ?? ""),
            descricao: firstItem?.description ?? "",
        },
    ];
}
