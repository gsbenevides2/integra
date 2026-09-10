import { instrumentableFetch } from "core/instrumentation";
import { TRAIN_LINES } from "../constants";
import { getTrainLineStatus } from "../statusClassifier";
import type { ProcessedTrainLine } from "../types";
import type { CCRResponse } from "./types";

const CCR_URL =
    "https://webapi.grupoccr.com.br/v1/mobility/public/line-status/current/state/SP";

async function fetchCCRLines(traceId: string): Promise<CCRResponse> {
    const response = await instrumentableFetch(traceId, CCR_URL, {
        cache: "no-store",
    });
    return (await response.json()) as CCRResponse;
}

export async function processCCRLines(traceId: string): Promise<ProcessedTrainLine[]> {
    const ccrLines = TRAIN_LINES.filter((line) => line.company === "ccr");
    const data = await fetchCCRLines(traceId);
    const allLines = data.data.concessoes.flatMap((concessao) => concessao.linhas);

    return ccrLines.map((line) => {
        const match = allLines.find((item) => item.numero.toString() === line.code.toString());
        return {
            codigo: line.code,
            cor: line.color,
            situacao: match?.statusLinha.status ?? "",
            status: getTrainLineStatus(match?.statusLinha.status ?? ""),
            descricao: match?.statusLinha.descricao ?? "",
        };
    });
}
