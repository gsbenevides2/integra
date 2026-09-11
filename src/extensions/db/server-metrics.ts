import { integer, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

export const serverMetrics = pgSchema("server_metrics");

export interface DiskSnapshot {
    filesystem: string;
    totalMb: number;
    usedMb: number;
    freeMb: number;
    usagePercent: number;
    mountedAt: string;
}

export const serverMetricsSnapshots = serverMetrics.table("snapshots", {
    id: text()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    memoryTotalMb: integer().notNull(),
    memoryUsedMb: integer().notNull(),
    memoryFreeMb: integer().notNull(),
    networkRxKbs: integer().notNull(),
    networkTxKbs: integer().notNull(),
    disks: jsonb().$type<DiskSnapshot[]>().notNull(),
    collectedAt: timestamp({ withTimezone: true }).notNull(),
});
