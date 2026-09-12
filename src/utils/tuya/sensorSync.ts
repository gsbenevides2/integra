import { addTracerEvent, serializeError } from "core/instrumentation";
import {
    getDeviceLogs,
    getDevicesStatus,
    getThingProperties,
    listAccountDevices,
    type TuyaLogEntry,
} from "utils/tuya/cloud/client";
import { upsertDevicesFromCloud } from "utils/tuya/devices";
import { tuyaEvents } from "utils/tuya/events";
import {
    type ReadingInput,
    type Sensor,
    getLatestReadings,
    kindForCategory,
    kindForCodes,
    listEnabledSensors,
    newestReadingAt,
    pruneReadings,
    saveReadings,
    setKind,
    setLastEventAt,
    upsertSensors,
} from "utils/tuya/sensors";

/** Categories this integration treats as sensors rather than controllable devices. */
const SENSOR_CATEGORIES = new Set(["wsdcg", "mcs", "pir"]);

/** Tuya's category for a light bulb. */
const LAMP_CATEGORY = "dj";

/** Tuya's category for wall switches and relay modules. */
const SWITCH_CATEGORY = "tdq";

/** Product ids known to be PIR sensors despite advertising a switch category. */
const MOTION_PRODUCT_IDS = new Set(["gk0d4i8g5akryd9d"]);

const LOG_PAGE_SIZE = 100;
const MAX_LOG_PAGES = 10;
/** How far back the very first sync reaches when a sensor has no history yet. */
const INITIAL_BACKFILL_MS = 24 * 60 * 60 * 1000;
const READING_RETENTION_DAYS = 90;

function retentionCutoff(): Date {
    return new Date(Date.now() - READING_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Drops readings the retention sweep would delete moments later. Without this a data point
 * the device set years ago — an installation setting, or the last gasp of a sensor with a
 * flat battery — is re-inserted, pruned and re-announced on every single pass.
 */
function withinRetention(readings: ReadingInput[]): ReadingInput[] {
    const cutoff = retentionCutoff();
    return readings.filter((reading) => reading.recordedAt > cutoff);
}

export interface CatalogueResult {
    lamps: number;
    sensors: number;
}

/**
 * The Tuya account is the single source of truth for what exists. LAN discovery still runs,
 * but only to learn a bulb's address and protocol — never to decide whether it exists.
 */
export async function syncCatalogue(traceId: string): Promise<CatalogueResult> {
    const devices = await listAccountDevices(traceId);

    const statuses = await getDevicesStatus(
        devices.map((device) => device.id),
        traceId,
    );

    const countChannels = (deviceId: string) =>
        (statuses.get(deviceId) ?? []).filter((entry) => /^switch_\d+$/.test(entry.code)).length;

    const controllable = devices
        .filter((device) => {
            if (device.category === LAMP_CATEGORY) return true;
            // A relay module is a switch category that actually exposes relay channels; the
            // PIR sensors share that category but expose none.
            return device.category === SWITCH_CATEGORY && countChannels(device.id) > 0;
        })
        .map((device) => ({
            tuyaDeviceId: device.id,
            name: device.name.trim(),
            localKey: device.local_key,
            online: device.online,
            kind: device.category === LAMP_CATEGORY ? ("lamp" as const) : ("switch" as const),
            channelCount: device.category === LAMP_CATEGORY ? null : countChannels(device.id),
        }));

    const lampCount = await upsertDevicesFromCloud(controllable);

    const sensors = devices
        .filter(
            (device) =>
                SENSOR_CATEGORIES.has(device.category) ||
                // The batch listing and the detail endpoint disagree on product_name for some
                // devices, so the user-facing name is checked too.
                /motion|pir|occupanc|sensor/i.test(
                    `${device.product_name ?? ""} ${device.name ?? ""}`,
                ) ||
                // These PIR units declare themselves as wall switches and report nothing on
                // the v1 status endpoint; the model id is what gives them away.
                MOTION_PRODUCT_IDS.has(device.product_id ?? ""),
        )
        .map((device) => ({
            tuyaDeviceId: device.id,
            name: device.name,
            kind: kindForCategory(device.category, device.product_name),
            category: device.category,
            online: device.online,
        }));

    await upsertSensors(sensors);

    await addTracerEvent({
        traceId,
        eventName: "Tuya catalogue synced",
        eventType: "INFO",
        eventData: {
            accountDevices: devices.length,
            devices: controllable.map(({ name, kind, online }) => ({ name, kind, online })),
            sensors: sensors.map(({ name, kind, category, online }) => ({
                name,
                kind,
                category,
                online,
            })),
        },
    });

    return { lamps: lampCount, sensors: sensors.length };
}

/**
 * Pulls every data point change since the last cursor. The Tuya log is returned newest
 * first, so older entries in the same window are reached by walking the window's end
 * backwards — that way a burst larger than one page is not silently truncated.
 */
async function fetchLogWindow(
    deviceId: string,
    from: Date,
    to: Date,
    traceId: string,
): Promise<TuyaLogEntry[]> {
    const collected: TuyaLogEntry[] = [];
    let windowEnd = to;

    for (let page = 0; page < MAX_LOG_PAGES; page++) {
        const entries = await getDeviceLogs(deviceId, from, windowEnd, traceId, LOG_PAGE_SIZE);
        if (entries.length === 0) break;

        collected.push(...entries);
        if (entries.length < LOG_PAGE_SIZE) break;

        const oldest = Math.min(...entries.map((entry) => Number(entry.event_time)));
        if (oldest <= from.getTime()) break;
        windowEnd = new Date(oldest - 1);
    }

    return collected;
}

/**
 * Reads the thing-model properties, which carry the device's own timestamp for the last
 * change of each data point. Polling cannot see a trigger that came and went between two
 * passes, but whatever it does see is recorded at the moment the device says it happened,
 * not the moment we asked.
 */
async function syncThingProperties(sensor: Sensor, traceId: string): Promise<number> {
    const properties = await getThingProperties(sensor.tuyaDeviceId, traceId);
    if (properties.length === 0) return 0;

    const detected = kindForCodes(
        properties.map((property) => property.code),
        sensor.kind,
    );
    if (detected !== sensor.kind) await setKind(sensor.id, detected);

    // The device re-sends unchanged properties with a fresh timestamp on every
    // transmission, so the unique index alone would still let a constant battery level pile
    // up a row a minute. Only an actual change in value is worth a row.
    const latest = await getLatestReadings(sensor.id);

    const readings = withinRetention(
        properties
            .filter((property) => latest[property.code] !== String(property.value))
            .map((property) => ({
                sensorId: sensor.id,
                code: property.code,
                value: String(property.value),
                recordedAt: new Date(property.time),
            })),
    );

    const saved = await saveReadings(readings);
    publishSensorChanges(sensor, readings, latest);
    return saved;
}

/**
 * Announces every reading that differs from the value last seen for that data point. The
 * readings arrive oldest-first, so a burst such as a door opening and closing produces one
 * event per transition rather than only the final state.
 */
function publishSensorChanges(
    sensor: Sensor,
    readings: ReadingInput[],
    previousValues: Record<string, string>,
): void {
    const seen = { ...previousValues };
    const ordered = [...readings].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

    for (const reading of ordered) {
        const previousValue = seen[reading.code] ?? null;
        if (previousValue === reading.value) continue;
        seen[reading.code] = reading.value;

        tuyaEvents.emitSensorChange({
            sensor,
            code: reading.code,
            value: reading.value,
            previousValue,
            at: reading.recordedAt,
        });
    }
}

async function syncOneSensor(sensor: Sensor, traceId: string): Promise<number> {
    // Only the event cursor may act as the floor. A seeded status reading carries the time
    // it was observed, not the time the device reported it, so using it would skip the
    // backfill entirely.
    const floor = sensor.lastEventAt;
    const from = floor ?? new Date(Date.now() - INITIAL_BACKFILL_MS);
    const to = new Date();

    const entries = await fetchLogWindow(sensor.tuyaDeviceId, from, to, traceId);

    const readings: ReadingInput[] = entries
        .map((entry) => ({
            sensorId: sensor.id,
            code: entry.code,
            value: String(entry.value),
            recordedAt: new Date(Number(entry.event_time)),
        }))
        // The window is inclusive on both ends, so drop anything already stored.
        .filter((reading) => !floor || reading.recordedAt > floor);

    const fresh = withinRetention(readings);
    const previousValues = await getLatestReadings(sensor.id);
    await saveReadings(fresh);
    publishSensorChanges(sensor, fresh, previousValues);

    const newest = readings.reduce<Date | null>(
        (latest, reading) => (!latest || reading.recordedAt > latest ? reading.recordedAt : latest),
        null,
    );
    if (newest) await setLastEventAt(sensor.id, newest);

    return readings.length;
}

/** Seeds a sensor that has no event history yet, so the UI is not blank on first run. */
async function seedFromStatus(sensors: Sensor[], traceId: string): Promise<number> {
    const needsSeed: Sensor[] = [];
    for (const sensor of sensors) {
        if (!(await newestReadingAt(sensor.id))) needsSeed.push(sensor);
    }
    if (needsSeed.length === 0) return 0;

    const statuses = await getDevicesStatus(
        needsSeed.map((sensor) => sensor.tuyaDeviceId),
        traceId,
    );

    const now = new Date();
    const readings: ReadingInput[] = [];
    for (const sensor of needsSeed) {
        for (const entry of statuses.get(sensor.tuyaDeviceId) ?? []) {
            readings.push({
                sensorId: sensor.id,
                code: entry.code,
                value: String(entry.value),
                recordedAt: now,
            });
        }
    }

    await saveReadings(readings);
    return readings.length;
}

export async function syncSensorReadings(traceId: string): Promise<void> {
    const sensors = await listEnabledSensors();
    let total = 0;

    for (const sensor of sensors) {
        try {
            total += await syncOneSensor(sensor, traceId);
            total += await syncThingProperties(sensor, traceId);
        } catch (error) {
            await addTracerEvent({
                traceId,
                eventName: "Tuya sensor sync failed",
                eventType: "ERROR",
                eventData: {
                    sensorId: sensor.id,
                    name: sensor.name,
                    error: serializeError(error),
                },
            });
        }
    }

    // Anything the event log could not fill in falls back to the current status, so a
    // sensor that has never logged still shows a value.
    const seeded = await seedFromStatus(sensors, traceId);

    await pruneReadings(retentionCutoff());

    await addTracerEvent({
        traceId,
        eventName: "Tuya sensor readings synced",
        eventType: "INFO",
        eventData: { sensors: sensors.length, newReadings: total, seeded },
    });
}
