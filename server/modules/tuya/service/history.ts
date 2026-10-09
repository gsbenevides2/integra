import { db } from "@server/db";
import {
  platformStatusChecks,
  serverMetricsSnapshots,
  serverMetricsSpeedtestSnapshots,
  tplinkOnlineChecks,
  tplinkOnlineDeviceChecks,
  tplinkRouterStatusHistory,
  trainStatusChecks,
} from "@server/db/schema";

import { inArray, lt } from "drizzle-orm";

import { getLogger, logInfo } from "../../../instrumentation/instrumentLogger";

const log = getLogger("tuya");
import { SensorService } from "./sensors";
import { StateService } from "./state";

const READING_RETENTION_DAYS = 90;
const HISTORY_RETENTION_DAYS = 30;
// Monitoring checks only ever grow (platforms alone add ~6k rows a day).
const MONITORING_RETENTION_DAYS = 90;

export abstract class HistoryService {
  // Explicit constructor: bun counts an implicit one as an uncoverable function.
  constructor() {}

  /**
   * Pure DB hygiene, no polling: device and sensor state now arrives entirely through the
   * Pulsar push connection, so this only bounds how much history piles up.
   *
   * Scheduled daily via Bun.cron in server/cron.ts, which also owns the tracing span.
   */
  static async pruneAll(): Promise<void> {
    const readingsCutoff = new Date(
      Date.now() - READING_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const stateCutoff = new Date(
      Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    await SensorService.pruneReadings(readingsCutoff);
    await StateService.pruneStateHistory(stateCutoff);
    await HistoryService.pruneMonitoring(
      new Date(Date.now() - MONITORING_RETENTION_DAYS * 24 * 60 * 60 * 1000),
    );

    logInfo(log, "tuya history pruned", {
      readings_cutoff: readingsCutoff.toISOString(),
      state_cutoff: stateCutoff.toISOString(),
    });
  }

  /** Same daily run also bounds the append-only monitoring tables (sequential, to spare the pool). */
  static async pruneMonitoring(olderThan: Date): Promise<void> {
    // Device checks hang off a check row, so they go first, keyed by the checks about to expire.
    await db
      .delete(tplinkOnlineDeviceChecks)
      .where(
        inArray(
          tplinkOnlineDeviceChecks.checkId,
          db
            .select({ id: tplinkOnlineChecks.id })
            .from(tplinkOnlineChecks)
            .where(lt(tplinkOnlineChecks.createdAt, olderThan)),
        ),
      );
    await db
      .delete(tplinkOnlineChecks)
      .where(lt(tplinkOnlineChecks.createdAt, olderThan));
    await db
      .delete(tplinkRouterStatusHistory)
      .where(lt(tplinkRouterStatusHistory.collectedAt, olderThan));
    await db
      .delete(serverMetricsSnapshots)
      .where(lt(serverMetricsSnapshots.collectedAt, olderThan));
    await db
      .delete(serverMetricsSpeedtestSnapshots)
      .where(lt(serverMetricsSpeedtestSnapshots.collectedAt, olderThan));
    await db
      .delete(platformStatusChecks)
      .where(lt(platformStatusChecks.checkedAt, olderThan));
    await db
      .delete(trainStatusChecks)
      .where(lt(trainStatusChecks.checkedAt, olderThan));
  }
}
