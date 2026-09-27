import type { ProcessedTrainLine } from "../../model";
import { TRAIN_LINES } from "../../model";
import { getTrainLineStatus } from "../statusClassifier";

const CCR_URL =
  "https://webapi.grupoccr.com.br/v1/mobility/public/line-status/current/state/SP";

interface CCRResponse {
  status: boolean;
  message: string;
  errorCode: string;
  data: {
    dataAtualizacao: string;
    concessoes: {
      uid: string;
      nome: string;
      estados: string;
      linhas: {
        uid: string;
        numero: number | string;
        nome: string;
        corRgb: string;
        statusLinha: { codigo: string; status: string; descricao?: string };
      }[];
    }[];
  };
}

async function fetchCCRLines(): Promise<CCRResponse> {
  const response = await fetch(CCR_URL, { cache: "no-store" });
  return (await response.json()) as CCRResponse;
}

export async function processCCRLines(): Promise<ProcessedTrainLine[]> {
  const ccrLines = TRAIN_LINES.filter((line) => line.company === "ccr");
  const data = await fetchCCRLines();
  const allLines = data.data.concessoes.flatMap(
    (concessao) => concessao.linhas,
  );

  return ccrLines.map((line) => {
    const match = allLines.find(
      (item) => item.numero.toString() === line.code.toString(),
    );
    return {
      codigo: line.code,
      cor: line.color,
      situacao: match?.statusLinha.status ?? "",
      status: getTrainLineStatus(match?.statusLinha.status ?? ""),
      descricao: match?.statusLinha.descricao ?? "",
    };
  });
}
