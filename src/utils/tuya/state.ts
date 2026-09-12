import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "core/db";
import { tuyaDeviceStateHistory } from "core/db/schema";
import { type DeviceState, type WorkMode, statesEqual } from "utils/tuya/capabilities";
import { getDevice } from "utils/tuya/devices";
import { diffDeviceState, tuyaEvents } from "utils/tuya/events";

const HISTORY_PAGE_SIZE = 200;

type HistoryRow = typeof tuyaDeviceStateHistory.$inferSelect;

function rowToState(row: HistoryRow): DeviceState {
    return {
        online: row.online,
        power: row.power,
        brightness: row.brightness,
        colorTemp: row.colorTemp,
        colorHex: row.colorHex,
        workMode: (row.workMode as WorkMode | null) ?? null,
        channels: row.channels ? (JSON.parse(row.channels) as Record<string, boolean>) : null,
    };
}

export async function getLatestState(deviceId: string): Promise<DeviceState | null> {
    const [row] = await db
        .select()
        .from(tuyaDeviceStateHistory)
        .where(eq(tuyaDeviceStateHistory.deviceId, deviceId))
        .orderBy(desc(tuyaDeviceStateHistory.recordedAt))
        .limit(1);

    return row ? rowToState(row) : null;
}

/**
 * Appends a history row only when the state actually differs from the last one recorded.
 * The device pushes a STATUS frame on every change, so this keeps one row per real change
 * instead of one row per poll.
 */
export async function saveStateIfChanged(deviceId: string, state: DeviceState): Promise<boolean> {
    const latest = await getLatestState(deviceId);
    if (latest && statesEqual(latest, state)) return false;

    await publishDeviceChange(deviceId, latest, state);

    await db.insert(tuyaDeviceStateHistory).values({
        deviceId,
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

export interface StateHistoryPage {
    snapshots: HistoryRow[];
    hasMore: boolean;
    nextCursor: string | null;
}

export async function getStateHistory(deviceId: string, before?: Date): Promise<StateHistoryPage> {
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

    return {
        // Oldest first, so charts can plot straight from the array.
        snapshots: [...snapshots].reverse(),
        hasMore,
        nextCursor: hasMore ? (snapshots.at(-1)?.recordedAt.toISOString() ?? null) : null,
    };
}

/** Keeps the table bounded; a lamp running colour scenes writes steadily even when throttled. */
export async function pruneStateHistory(olderThan: Date): Promise<void> {
    await db.delete(tuyaDeviceStateHistory).where(lt(tuyaDeviceStateHistory.recordedAt, olderThan));
}

/**
 * Announces the change to any script watching. Listener failures must never take down the
 * collector that produced the event, so each one is isolated.
 */
async function publishDeviceChange(
    deviceId: string,
    previous: DeviceState | null,
    current: DeviceState,
): Promise<void> {
    const device = await getDevice(deviceId);
    if (!device) return;

    tuyaEvents.emitDeviceChange({
        device,
        previous,
        current,
        changed: diffDeviceState(previous, current),
        at: new Date(),
    });
}
