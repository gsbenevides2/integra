import { db } from "@server/db";
import {
  type DiskSnapshot,
  serverMetricsSnapshots,
  serverMetricsSpeedtestSnapshots,
} from "@server/db/schema";
import { runSshCommand } from "@server/shared/ssh";

import { desc, lt } from "drizzle-orm";

import { SistemaStatusSchema } from "../model";
import { runCloudflareSpeedtest } from "./cloudflareSpeedtest";

const HISTORY_PAGE_SIZE = 200;

type SnapshotRow = typeof serverMetricsSnapshots.$inferSelect;
type SpeedtestRow = typeof serverMetricsSpeedtestSnapshots.$inferSelect;

interface Page<T> {
  snapshots: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

function parseUnitValue(value: string): number {
  return Number(value.replace(/[^0-9.]/g, ""));
}

export abstract class ServerMetricsService {
  // explicit ctor: bun cannot count an implicit one as covered
  protected constructor() {}

  static async getServerStatus() {
    const scriptPath = process.env.STATS_SCRIPT_PATH ?? "/home/gsbenevides2/stats.sh";
    const { stdout } = await runSshCommand(scriptPath);
    return SistemaStatusSchema.parse(JSON.parse(stdout));
  }

  static async collect(): Promise<void> {
    const status = await ServerMetricsService.getServerStatus();
    const collectedAt = new Date();

    const disks: DiskSnapshot[] = status.discos.map((disk) => ({
      filesystem: disk.filesystem,
      totalMb: parseUnitValue(disk.total),
      usedMb: parseUnitValue(disk.usado),
      freeMb: parseUnitValue(disk.livre),
      usagePercent: parseUnitValue(disk.uso_porcentagem),
      mountedAt: disk.montado_em,
    }));

    await db.insert(serverMetricsSnapshots).values({
      memoryTotalMb: Math.round(Number(status.memoria.total_mb)),
      memoryUsedMb: Math.round(Number(status.memoria.usada_mb)),
      memoryFreeMb: Math.round(Number(status.memoria.livre_mb)),
      networkRxKbs: Math.round(Number(status.rede.rx_kbs)),
      networkTxKbs: Math.round(Number(status.rede.tx_kbs)),
      disks,
      collectedAt,
    });
  }

  static async collectSpeedtest(): Promise<void> {
    const { downloadMbps, uploadMbps, latencyMs } = await runCloudflareSpeedtest();
    await db.insert(serverMetricsSpeedtestSnapshots).values({
      downloadMbps,
      uploadMbps,
      latencyMs,
      collectedAt: new Date(),
    });
  }

  static async latest(): Promise<SnapshotRow | null> {
    const [row] = await db
      .select()
      .from(serverMetricsSnapshots)
      .orderBy(desc(serverMetricsSnapshots.collectedAt))
      .limit(1);
    return row ?? null;
  }

  static async history(before?: Date): Promise<Page<SnapshotRow>> {
    const where = before
      ? lt(serverMetricsSnapshots.collectedAt, before)
      : undefined;
    const rows = await db
      .select()
      .from(serverMetricsSnapshots)
      .where(where)
      .orderBy(desc(serverMetricsSnapshots.collectedAt))
      .limit(HISTORY_PAGE_SIZE + 1);

    const hasMore = rows.length > HISTORY_PAGE_SIZE;
    const snapshots = hasMore ? rows.slice(0, HISTORY_PAGE_SIZE) : rows;
    const lastSnapshot = snapshots[snapshots.length - 1];

    return {
      snapshots: [...snapshots].reverse(),
      hasMore,
      nextCursor: hasMore ? (lastSnapshot?.collectedAt.toISOString() ?? null) : null,
    };
  }

  static async speedtestLatest(): Promise<SpeedtestRow | null> {
    const [row] = await db
      .select()
      .from(serverMetricsSpeedtestSnapshots)
      .orderBy(desc(serverMetricsSpeedtestSnapshots.collectedAt))
      .limit(1);
    return row ?? null;
  }

  static async speedtestHistory(before?: Date): Promise<Page<SpeedtestRow>> {
    const where = before
      ? lt(serverMetricsSpeedtestSnapshots.collectedAt, before)
      : undefined;
    const rows = await db
      .select()
      .from(serverMetricsSpeedtestSnapshots)
      .where(where)
      .orderBy(desc(serverMetricsSpeedtestSnapshots.collectedAt))
      .limit(HISTORY_PAGE_SIZE + 1);

    const hasMore = rows.length > HISTORY_PAGE_SIZE;
    const snapshots = hasMore ? rows.slice(0, HISTORY_PAGE_SIZE) : rows;
    const lastSnapshot = snapshots[snapshots.length - 1];

    return {
      snapshots: [...snapshots].reverse(),
      hasMore,
      nextCursor: hasMore ? (lastSnapshot?.collectedAt.toISOString() ?? null) : null,
    };
  }
}
