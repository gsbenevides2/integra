import { db } from "@server/db";
import { tuyaDeviceStateHistory } from "@server/db/schema";

import { and, desc, eq, inArray, lt } from "drizzle-orm";

import { diffDeviceState, tuyaEvents } from "../events";
import { type DeviceState, statesEqual, type WorkMode } from "../model";
import type { Device } from "./devices";

const HISTORY_PAGE_SIZE = 200;

type HistoryRow = typeof tuyaDeviceStateHistory.$inferSelect;

export interface StateHistoryPage {
  snapshots: HistoryRow[];
  hasMore: boolean;
  nextCursor: string | null;
}

function rowToState(row: HistoryRow): DeviceState {
  return {
    online: row.online,
    power: row.power,
    brightness: row.brightness,
    colorTemp: row.colorTemp,
    colorHex: row.colorHex,
    workMode: (row.workMode as WorkMode | null) ?? null,
    channels: row.channels
      ? (JSON.parse(row.channels) as Record<string, boolean>)
      : null,
  };
}

export abstract class StateService {
  // Explicit constructor: bun counts an implicit one as an uncoverable function.
  constructor() {}

  static async getLatestState(deviceId: string): Promise<DeviceState | null> {
    const [row] = await db
      .select()
      .from(tuyaDeviceStateHistory)
      .where(eq(tuyaDeviceStateHistory.deviceId, deviceId))
      .orderBy(desc(tuyaDeviceStateHistory.recordedAt))
      .limit(1);

    return row ? rowToState(row) : null;
  }

  /** The newest state of every device in one query, instead of one per device. */
  static async getLatestStates(
    deviceIds: string[],
  ): Promise<Map<string, DeviceState>> {
    if (deviceIds.length === 0) return new Map();
    const rows = await db
      .selectDistinctOn([tuyaDeviceStateHistory.deviceId])
      .from(tuyaDeviceStateHistory)
      .where(inArray(tuyaDeviceStateHistory.deviceId, deviceIds))
      .orderBy(
        tuyaDeviceStateHistory.deviceId,
        desc(tuyaDeviceStateHistory.recordedAt),
      );
    return new Map(rows.map((row) => [row.deviceId, rowToState(row)]));
  }

  /**
   * Appends a history row only when the state actually differs from the last one recorded.
   * The device pushes a STATUS frame on every change, so this keeps one row per real change
   * instead of one row per poll.
   */
  static async saveStateIfChanged(
    device: Device,
    state: DeviceState,
  ): Promise<boolean> {
    const latest = await StateService.getLatestState(device.id);
    if (latest && statesEqual(latest, state)) return false;

    StateService.publishDeviceChange(device, latest, state);

    await db.insert(tuyaDeviceStateHistory).values({
      deviceId: device.id,
      online: state.online,
      power: state.power,
      brightness: state.brightness,
      colorTemp: state.colorTemp,
      colorHex: state.colorHex,
      workMode: state.workMode,
      channels: state.channels ? JSON.stringify(state.channels) : null,
    });

    return true;
  }

  static async getStateHistory(
    deviceId: string,
    before?: Date,
  ): Promise<StateHistoryPage> {
    const where = before
      ? and(
          eq(tuyaDeviceStateHistory.deviceId, deviceId),
          lt(tuyaDeviceStateHistory.recordedAt, before),
        )
      : eq(tuyaDeviceStateHistory.deviceId, deviceId);

    const rows = await db
      .select()
      .from(tuyaDeviceStateHistory)
      .where(where)
      .orderBy(desc(tuyaDeviceStateHistory.recordedAt))
      .limit(HISTORY_PAGE_SIZE + 1);

    const hasMore = rows.length > HISTORY_PAGE_SIZE;
    const snapshots = hasMore ? rows.slice(0, HISTORY_PAGE_SIZE) : rows;
    const lastSnapshot = snapshots[snapshots.length - 1];

    return {
      // Oldest first, so charts can plot straight from the array.
      snapshots: [...snapshots].reverse(),
      hasMore,
      nextCursor: hasMore
        ? (lastSnapshot?.recordedAt.toISOString() ?? null)
        : null,
    };
  }

  /** Keeps the table bounded; a lamp running colour scenes writes steadily even when throttled. */
  static async pruneStateHistory(olderThan: Date): Promise<void> {
    await db
      .delete(tuyaDeviceStateHistory)
      .where(lt(tuyaDeviceStateHistory.recordedAt, olderThan));
  }

  /**
   * Announces the change to any script watching. Listener failures must never take down the
   * collector that produced the event, so each one is isolated.
   */
  private static publishDeviceChange(
    device: Device,
    previous: DeviceState | null,
    current: DeviceState,
  ): void {
    tuyaEvents.emitDeviceChange({
      device,
      previous,
      current,
      changed: diffDeviceState(previous, current),
      at: new Date(),
    });
  }
}
