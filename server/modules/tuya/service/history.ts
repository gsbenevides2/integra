import { getLogger, logInfo } from "../../../instrumentation/instrumentLogger";

const log = getLogger("tuya");
import { SensorService } from "./sensors";
import { StateService } from "./state";

const READING_RETENTION_DAYS = 90;
const HISTORY_RETENTION_DAYS = 30;

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

    logInfo(log, "tuya history pruned", {
      readings_cutoff: readingsCutoff.toISOString(),
      state_cutoff: stateCutoff.toISOString(),
    });
  }
}
