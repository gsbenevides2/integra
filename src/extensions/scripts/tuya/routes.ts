import Elysia, { status } from "elysia";
import z from "zod";
import onHttp from "core/triggers/http";
import { BULB_TYPES, WORK_MODES, type DeviceState, OFFLINE_STATE } from "utils/tuya/capabilities";
import { listDiscovered } from "utils/tuya/discoveryCache";
import {
    createDevice,
    deleteDevice,
    getDevice,
    listDevices,
    updateDevice,
    type PublicDevice,
} from "utils/tuya/devices";
import { probeDevice } from "utils/tuya/probe";
import { TUYA_PROTOCOL_VERSIONS } from "utils/tuya/protocol/types";
import { dropConnection, getCachedState, readState } from "utils/tuya/registry";
import { getLatestState, getStateHistory } from "utils/tuya/state";
import {
    getReadingHistory,
    getSensor,
    getLatestReadingsFor,
    listSensors,
    renameSensor,
    setEnabled,
    setHidden,
} from "utils/tuya/sensors";
import { commandDevice, readDeviceState, UNTRACED } from "utils/tuya/deviceAccess";
import { syncCatalogue, syncSensorReadings } from "utils/tuya/sensorSync";

const lampBody = z.object({
    name: z.string().min(1),
    tuyaDeviceId: z.string().min(1),
    localKey: z.string().min(1),
    ip: z.string().nullable().optional(),
    protocolVersion: z.enum(TUYA_PROTOCOL_VERSIONS).nullable().optional(),
    bulbType: z.enum(BULB_TYPES).nullable().optional(),
    enabled: z.boolean().optional(),
    hidden: z.boolean().optional(),
});

// localKey stays optional on edit so leaving the field blank keeps the stored one.
const lampUpdateBody = lampBody.partial();

const commandBody = z
    .object({
        power: z.boolean().optional(),
        brightness: z.number().min(0).max(100).optional(),
        colorTemp: z.number().min(0).max(100).optional(),
        colorHex: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/, "Expected a #rrggbb colour")
            .optional(),
        workMode: z.enum(WORK_MODES).optional(),
        channels: z.record(z.string(), z.boolean()).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, "At least one field is required");

interface LampWithState extends PublicDevice {
    state: DeviceState;
}

export const tuyaElysiaClient = new Elysia({ prefix: "/tuya" })
    .get(
        "/devices",
        async ({ query }): Promise<LampWithState[]> => {
            const all = await listDevices();
            const lamps = query.includeHidden === "true" ? all : all.filter((l) => !l.hidden);
            return Promise.all(
                lamps.map(async (lamp) => ({
                    ...lamp,
                    // The live socket is ahead of the throttled history, so prefer it.
                    state:
                        getCachedState(lamp.id) ?? (await getLatestState(lamp.id)) ?? OFFLINE_STATE,
                })),
            );
        },
        { query: z.object({ includeHidden: z.string().optional() }) },
    )
    .post("/devices", async ({ body }) => createDevice(body), { body: lampBody })
    .put(
        "/devices/:id",
        async ({ params, body }) => {
            const updated = await updateDevice(params.id, body);
            if (!updated) return status(404, { error: "Lamp not found" });
            // Anything from the key to the IP may have changed; force a fresh handshake.
            dropConnection(params.id);
            return updated;
        },
        { body: lampUpdateBody },
    )
    .delete("/devices/:id", async ({ params }) => {
        dropConnection(params.id);
        await deleteDevice(params.id);
        return { ok: true };
    })
    .get("/devices/:id/state", async ({ params }) => {
        const lamp = await getDevice(params.id);
        if (!lamp) return status(404, { error: "Lamp not found" });
        try {
            const { state, transport } = await readDeviceState(lamp, UNTRACED);
            return { ...state, transport };
        } catch {
            return { ...OFFLINE_STATE, transport: "cloud" as const };
        }
    })
    .post(
        "/devices/:id/command",
        async ({ params, body }) => {
            const lamp = await getDevice(params.id);
            if (!lamp) return status(404, { error: "Lamp not found" });
            try {
                const { state, transport } = await commandDevice(lamp, body, UNTRACED);
                return { ...state, transport };
            } catch (error) {
                return status(503, {
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        },
        { body: commandBody },
    )
    .post("/devices/:id/probe", async ({ params }) => {
        const lamp = await getDevice(params.id);
        if (!lamp) return status(404, { error: "Lamp not found" });
        dropConnection(lamp.id);
        try {
            const { ip, protocolVersion, bulbType } = await probeDevice(lamp);
            const state = await readState({ ...lamp, ip, protocolVersion, bulbType });
            return { ip, protocolVersion, bulbType, state };
        } catch (error) {
            return status(503, { error: error instanceof Error ? error.message : String(error) });
        }
    })
    .get(
        "/devices/:id/history",
        async ({ params, query }) =>
            getStateHistory(params.id, query.before ? new Date(query.before) : undefined),
        { query: z.object({ before: z.string().optional() }) },
    )
    .get(
        "/sensors",
        async ({ query }) => {
            const all = await listSensors();
            const sensors = query.includeHidden === "true" ? all : all.filter((s) => !s.hidden);
            const latest = await getLatestReadingsFor(sensors.map((sensor) => sensor.id));
            return sensors.map((sensor) => ({
                ...sensor,
                readings: latest.get(sensor.id) ?? {},
            }));
        },
        { query: z.object({ includeHidden: z.string().optional() }) },
    )
    .put(
        "/sensors/:id",
        async ({ params, body }) => {
            const sensor = await getSensor(params.id);
            if (!sensor) return status(404, { error: "Sensor not found" });
            if (body.name !== undefined) await renameSensor(params.id, body.name);
            if (body.enabled !== undefined) await setEnabled(params.id, body.enabled);
            if (body.hidden !== undefined) await setHidden(params.id, body.hidden);
            return getSensor(params.id);
        },
        {
            body: z.object({
                name: z.string().min(1).optional(),
                enabled: z.boolean().optional(),
                hidden: z.boolean().optional(),
            }),
        },
    )
    .get(
        "/sensors/:id/history",
        async ({ params, query }) =>
            getReadingHistory(params.id, {
                code: query.code,
                before: query.before ? new Date(query.before) : undefined,
            }),
        { query: z.object({ code: z.string().optional(), before: z.string().optional() }) },
    )
    .post("/catalogue/sync", async () => {
        const traceId = crypto.randomUUID();
        const found = await syncCatalogue(traceId);
        await syncSensorReadings(traceId);
        return { ok: true, ...found };
    })
    .get("/discovered", async () => {
        const lamps = await listDevices();
        const known = new Set(lamps.map((lamp) => lamp.tuyaDeviceId));
        return listDiscovered().filter((device) => !known.has(device.deviceId));
    });

export const tuyaRoutes = onHttp(
    {
        id: "tuya-routes",
        dontTrace: true,
    },
    tuyaElysiaClient,
);
