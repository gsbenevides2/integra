import type { ProcessedTrainLine } from "../../model";
import { TRAIN_LINES } from "../../model";
import { getTrainLineStatus } from "../statusClassifier";

const CPTM_URL = "https://api.cptm.sp.gov.br/AppCPTM/v1/Linhas/ObterStatus";

interface CPTMLine {
  linhaId: number;
  dataGeracao: string;
  descricao: string;
  tipo: string;
  status: string;
}

async function fetchCPTMLines(): Promise<CPTMLine[]> {
  const response = await fetch(CPTM_URL, { cache: "no-store" });
  return (await response.json()) as CPTMLine[];
}

export async function processCPTMLines(): Promise<ProcessedTrainLine[]> {
  const cptmLines = TRAIN_LINES.filter((line) => line.company === "cptm");
  const data = await fetchCPTMLines();

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
