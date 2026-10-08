import { db } from "@server/db";
import { trainStatusChecks } from "@server/db/schema";

import { and, desc, eq, lt } from "drizzle-orm";

import { getTrainLinesStatus } from "./fetchers";
import { buildSegments } from "./history";

const HISTORY_PAGE_SIZE = 100;

export abstract class TrainStatusService {
  // explicit ctor: bun cannot count an implicit one as covered
  protected constructor() {}

  static async checkAll(): Promise<void> {
    const lines = await getTrainLinesStatus();
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

  static async listLatest() {
    const lines = await db
      .selectDistinctOn([trainStatusChecks.lineCode], {
        lineCode: trainStatusChecks.lineCode,
        lineColor: trainStatusChecks.lineColor,
        situation: trainStatusChecks.situation,
        status: trainStatusChecks.status,
        description: trainStatusChecks.description,
        checkedAt: trainStatusChecks.checkedAt,
      })
      .from(trainStatusChecks)
      .orderBy(trainStatusChecks.lineCode, desc(trainStatusChecks.checkedAt));

    return lines.sort((a, b) => a.lineCode - b.lineCode);
  }

  static async getHistory(lineCode: number, before: Date) {
    const checks = await db
      .select({
        status: trainStatusChecks.status,
        situation: trainStatusChecks.situation,
        description: trainStatusChecks.description,
        checkedAt: trainStatusChecks.checkedAt,
      })
      .from(trainStatusChecks)
      .where(
        and(
          eq(trainStatusChecks.lineCode, lineCode),
          lt(trainStatusChecks.checkedAt, before),
        ),
      )
      .orderBy(desc(trainStatusChecks.checkedAt))
      .limit(HISTORY_PAGE_SIZE);

    const ordered = checks.slice().reverse();
    const segments = buildSegments(ordered);
    const oldestCheck = checks.at(-1);

    return {
      checks: ordered,
      segments,
      hasMore: checks.length === HISTORY_PAGE_SIZE,
      nextCursor: oldestCheck ? oldestCheck.checkedAt.toISOString() : null,
    };
  }
}
