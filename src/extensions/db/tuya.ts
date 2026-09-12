import {
    boolean,
    index,
    integer,
    pgSchema,
    text,
    timestamp,
    uniqueIndex,
} from "drizzle-orm/pg-core";

export const tuya = pgSchema("tuya");

export const tuyaProtocolVersion = tuya.enum("protocol_version", ["3.1", "3.3", "3.4", "3.5"]);
export const tuyaBulbType = tuya.enum("bulb_type", ["A", "B", "C"]);
export const tuyaDeviceKind = tuya.enum("device_kind", ["lamp", "switch"]);

export const tuyaDevices = tuya.table("devices", {
    id: text()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    name: text().notNull(),
    tuyaDeviceId: text().notNull().unique(),
    localKey: text().notNull(),
    ip: text(),
    protocolVersion: tuyaProtocolVersion(),
    kind: tuyaDeviceKind().notNull().default("lamp"),
    /** Lamps only: which data point layout the bulb uses. */
    bulbType: tuyaBulbType(),
    /** Switches only: how many relay channels the device exposes. */
    channelCount: integer(),
    enabled: boolean().notNull().default(true),
    /** Kept out of the dashboard without stopping control or history. */
    hidden: boolean().notNull().default(false),
    online: boolean().notNull().default(false),
    lastSeenAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const tuyaDeviceStateHistory = tuya.table(
    "device_state_history",
    {
        id: text()
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        deviceId: text()
            .notNull()
            .references(() => tuyaDevices.id, { onDelete: "cascade" }),
        online: boolean().notNull(),
        power: boolean(),
        brightness: integer(),
        colorTemp: integer(),
        colorHex: text(),
        workMode: text(),
        /** Switches only: relay states keyed by channel, stored as JSON. */
        channels: text(),
        recordedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index("tuya_device_state_history_device_recorded_idx").on(table.deviceId, table.recordedAt),
    ],
);

export const tuyaSensorKind = tuya.enum("sensor_kind", [
    "temperature_humidity",
    "door",
    "motion",
    "unknown",
]);

export const tuyaSensors = tuya.table("sensors", {
    id: text()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    name: text().notNull(),
    tuyaDeviceId: text().notNull().unique(),
    kind: tuyaSensorKind().notNull().default("unknown"),
    category: text(),
    online: boolean().notNull().default(false),
    enabled: boolean().notNull().default(true),
    /** Kept out of the dashboard without stopping collection. */
    hidden: boolean().notNull().default(false),
    /** Cursor into the Tuya event log: the timestamp of the newest event already stored. */
    lastEventAt: timestamp({ withTimezone: true }),
    lastSeenAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per data point change, shaped after the Tuya event log so a backfill maps
 * straight onto it. Values are kept as text because a sensor mixes numbers, booleans and
 * enums across its data points.
 */
export const tuyaSensorReadings = tuya.table(
    "sensor_readings",
    {
        id: text()
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        sensorId: text()
            .notNull()
            .references(() => tuyaSensors.id, { onDelete: "cascade" }),
        code: text().notNull(),
        value: text().notNull(),
        recordedAt: timestamp({ withTimezone: true }).notNull(),
    },
    (table) => [
        // The thing-model poll re-reports the same value until it changes, so the device's
        // own timestamp is what makes a reading unique.
        uniqueIndex("tuya_sensor_readings_sensor_code_recorded_idx").on(
            table.sensorId,
            table.code,
            table.recordedAt,
        ),
    ],
);
