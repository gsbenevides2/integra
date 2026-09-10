import { db } from "core/db";
import { trainStatusChecks } from "extensions/db/train-status";
import { getTrainLinesStatus } from "utils/train-fetchers";

export async function checkTrainLinesStatus(traceId: string) {
    const lines = await getTrainLinesStatus(traceId);
    if (lines.length === 0) return;

    const checkedAt = new Date();
    await db.insert(trainStatusChecks).values(
        lines.map((line) => ({
            lineCode: line.codigo,
            lineColor: line.cor,
            situation: line.situacao,
            status: line.status,
            description: line.descricao ?? null,
            checkedAt,
        })),
    );
}
