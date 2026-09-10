import { instrumentableFetch } from "core/instrumentation";
import { TRAIN_LINES } from "../constants";
import { getTrainLineStatus } from "../statusClassifier";
import type { ProcessedTrainLine } from "../types";
import type { CPTMLine } from "./types";

const CPTM_URL = "https://api.cptm.sp.gov.br/AppCPTM/v1/Linhas/ObterStatus";

async function fetchCPTMLines(traceId: string): Promise<CPTMLine[]> {
    const response = await instrumentableFetch(traceId, CPTM_URL, {
        cache: "no-store",
    });
    return (await response.json()) as CPTMLine[];
}

export async function processCPTMLines(traceId: string): Promise<ProcessedTrainLine[]> {
    const cptmLines = TRAIN_LINES.filter((line) => line.company === "cptm");
    const data = await fetchCPTMLines(traceId);

    return cptmLines.map((line) => {
        const match = data.find((item) => item.linhaId === line.code);
        return {
            codigo: line.code,
            cor: line.color,
            situacao: match?.status ?? "",
            status: getTrainLineStatus(match?.status ?? ""),
            descricao: match?.descricao ?? "",
        };
    });
}
