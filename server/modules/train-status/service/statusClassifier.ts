import type { TrainLineStatus } from "../model";

const WARNING_SITUATIONS = [
  "atividade programada",
  "circulação de trens",
  "impacto pontual",
  "diferenciada",
  "especial",
  "parcial",
  "velocidade reduzida",
];

export function getTrainLineStatus(situation: string): TrainLineStatus {
  const lowerSituation = situation.toLowerCase();
  if (lowerSituation.includes("normal")) return "OK";
  if (WARNING_SITUATIONS.some((status) => lowerSituation.includes(status)))
    return "WARNING";
  if (lowerSituation.includes("paralisada")) return "CRITICAL";
  return "UNKNOWN";
}
