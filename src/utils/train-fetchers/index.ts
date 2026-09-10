import { processCCRLines } from "./ccr";
import { processCPTMLines } from "./cptm";
import { processLiaUniLines } from "./liauni";
import { processMetroLines } from "./metro";
import { processTICLines } from "./tic";
import type { ProcessedTrainLine } from "./types";

export type { ProcessedTrainLine, TrainLineStatus } from "./types";

export async function getTrainLinesStatus(traceId: string): Promise<ProcessedTrainLine[]> {
    const results = await Promise.all([
        processMetroLines(traceId),
        processCPTMLines(traceId),
        processCCRLines(traceId),
        processTICLines(traceId),
        processLiaUniLines(traceId),
    ]);

    return results.flat().sort((a, b) => a.codigo - b.codigo);
}
