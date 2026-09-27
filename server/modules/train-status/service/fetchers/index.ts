import type { ProcessedTrainLine } from "../../model";
import { processCCRLines } from "./ccr";
import { processCPTMLines } from "./cptm";
import { processLiaUniLines } from "./liauni";
import { processMetroLines } from "./metro";
import { processTICLines } from "./tic";

export async function getTrainLinesStatus(): Promise<ProcessedTrainLine[]> {
  const results = await Promise.all([
    processMetroLines(),
    processCPTMLines(),
    processCCRLines(),
    processTICLines(),
    processLiaUniLines(),
  ]);

  return results.flat().sort((a, b) => a.codigo - b.codigo);
}
