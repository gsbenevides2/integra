import { db } from "@server/db";
import { tplinkRouterStatusHistory, tplinkSettings } from "@server/db/schema";

import { desc, inArray, lt, sql } from "drizzle-orm";

const STATUS_HISTORY_PAGE_SIZE = 200;

export interface RouterStatus {
  wanIp: string;
  connectionStatus: string;
  connectionUptime: string;
  routerUptime: string;
  firmwareVersion: string;
  hardwareVersion: string;
  cpuUsage: number | null;
  memoryUsage: number | null;
  totalDownload: string | null;
  totalUpload: string | null;
}

const STATUS_KEYS = [
  "wanIp",
  "connectionStatus",
  "connectionUptime",
  "routerUptime",
  "firmwareVersion",
  "hardwareVersion",
  "cpuUsage",
  "memoryUsage",
  "totalDownload",
  "totalUpload",
] as const;

export abstract class TpLinkSettingsService {
  // explicit ctor: bun reports an implicit constructor as an uncovered function
  constructor() {}

  static async saveRouterStatus(status: Partial<RouterStatus>): Promise<void> {
    const entries = Object.entries(status).map(([key, value]) => ({
      key,
      value: value !== null && value !== undefined ? String(value) : "",
    }));
    if (entries.length === 0) return;

    await db
      .insert(tplinkSettings)
      .values(entries)
      .onConflictDoUpdate({
        target: tplinkSettings.key,
        set: { value: sql`EXCLUDED.value` },
      });
  }

  static async getLatestRouterStatus(): Promise<RouterStatus> {
    const rows = await db
      .select()
      .from(tplinkSettings)
      .where(inArray(tplinkSettings.key, [...STATUS_KEYS]));
    const map = new Map(rows.map((r) => [r.key, r.value]));

    return {
      wanIp: map.get("wanIp") ?? "",
      connectionStatus: map.get("connectionStatus") ?? "",
      connectionUptime: map.get("connectionUptime") ?? "",
      routerUptime: map.get("routerUptime") ?? "",
      firmwareVersion: map.get("firmwareVersion") ?? "",
      hardwareVersion: map.get("hardwareVersion") ?? "",
      cpuUsage: map.has("cpuUsage") ? Number(map.get("cpuUsage")) : null,
      memoryUsage: map.has("memoryUsage") ? Number(map.get("memoryUsage")) : null,
      totalDownload: map.get("totalDownload") ?? null,
      totalUpload: map.get("totalUpload") ?? null,
    };
  }

  static async saveRouterStatusHistory(
    status: Pick<RouterStatus, "cpuUsage" | "memoryUsage" | "connectionStatus">,
  ): Promise<void> {
    await db.insert(tplinkRouterStatusHistory).values({
      cpuUsage: status.cpuUsage,
      memoryUsage: status.memoryUsage,
      connectionStatus: status.connectionStatus,
    });
  }

  static async getRouterStatusHistory(before?: Date) {
    const snapshots = await db
      .select()
      .from(tplinkRouterStatusHistory)
      .where(before ? lt(tplinkRouterStatusHistory.collectedAt, before) : undefined)
      .orderBy(desc(tplinkRouterStatusHistory.collectedAt))
      .limit(STATUS_HISTORY_PAGE_SIZE);

    const ordered = snapshots.slice().reverse();
    const oldest = snapshots.at(-1);

    return {
      snapshots: ordered,
      hasMore: snapshots.length === STATUS_HISTORY_PAGE_SIZE,
      nextCursor: oldest ? oldest.collectedAt.toISOString() : null,
    };
  }
}
