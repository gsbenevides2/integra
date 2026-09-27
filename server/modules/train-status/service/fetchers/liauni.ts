import type { ProcessedTrainLine } from "../../model";
import { TRAIN_LINES } from "../../model";
import { getTrainLineStatus } from "../statusClassifier";

const LIAUNI_URL = "https://www.linhauni.com.br/api/status/linhauni";

interface LiaUniResponse {
  status: boolean;
  data: {
    type: string;
    listItem: {
      id: string;
      code: string;
      line: string;
      color: string;
      description: string;
      status: string;
      statusColor: string;
    }[];
    dateUpdate: string;
  };
}

async function fetchLiaUniLines(): Promise<LiaUniResponse> {
  const response = await fetch(LIAUNI_URL);
  return (await response.json()) as LiaUniResponse;
}

export async function processLiaUniLines(): Promise<ProcessedTrainLine[]> {
  const line = TRAIN_LINES.find((line) => line.company === "liauni");
  const data = await fetchLiaUniLines();
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
