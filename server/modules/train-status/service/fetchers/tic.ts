import type { ProcessedTrainLine } from "../../model";
import { TRAIN_LINES } from "../../model";
import { getTrainLineStatus } from "../statusClassifier";

const TIC_OWNER_LINE_STATUSES_URL =
  "https://www.tictrens.com.br/helper/owner-line-statuses";

interface TICOwnerLineResponse {
  status: boolean;
  data: {
    id: number;
    type: string;
    status: { id: number; name: string; statusCode: number; statusColor: string };
    description: string | null;
  }[];
}

async function fetchTICOwnerLineStatuses(): Promise<TICOwnerLineResponse> {
  const response = await fetch(TIC_OWNER_LINE_STATUSES_URL, {
    cache: "no-store",
  });
  return (await response.json()) as TICOwnerLineResponse;
}

export async function processTICLines(): Promise<ProcessedTrainLine[]> {
  const line = TRAIN_LINES.find((line) => line.company === "tic");
  const data = await fetchTICOwnerLineStatuses();
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
