import Elysia, { status } from "elysia";

import {
  applyPresetBody,
  commandBody,
  deviceBody,
  deviceUpdateBody,
  historyQuery,
  includeHiddenQuery,
  OFFLINE_STATE,
  presetBody,
  presetUpdateBody,
  sensorBody,
  sensorHistoryQuery,
  sensorUpdateBody,
} from "./model";
import { DeviceService, type DeviceWithState } from "./service/devices";
import { PresetService } from "./service/presets";
import { SensorService } from "./service/sensors";
import { StateService } from "./service/state";

export const tuyaRoutes = new Elysia({
  prefix: "/api/tuya",
  detail: {
    tags: ["Tuya"],
  },
})
  .get(
    "/devices",
    async ({ query }): Promise<DeviceWithState[]> => {
      const all = await DeviceService.list();
      const devices =
        query.includeHidden === "true" ? all : all.filter((d) => !d.hidden);
      return Promise.all(
        devices.map(async (device) => ({
          ...device,
          state:
            (await StateService.getLatestState(device.id)) ?? OFFLINE_STATE,
        })),
      );
    },
    {
      detail: {
        summary: "List Devices",
        description:
          "Lists configured devices with their latest known state. Hidden " +
          "devices are left out unless includeHidden is set.",
      },
      query: includeHiddenQuery,
    },
  )
  .post("/devices", async ({ body }) => DeviceService.create(body), {
    detail: {
      summary: "Create Device",
      description: "Registers a new Tuya-connected device.",
    },
    body: deviceBody,
  })
  .put(
    "/devices/:id",
    async ({ params, body }) => {
      const updated = await DeviceService.update(params.id, body);
      if (!updated) return status(404, { error: "Device not found" });
      return updated;
    },
    {
      detail: {
        summary: "Update Device",
        description: "Updates a device's configuration.",
      },
      body: deviceUpdateBody,
    },
  )
  .delete(
    "/devices/:id",
    async ({ params }) => {
      await DeviceService.delete(params.id);
      return { ok: true };
    },
    {
      detail: {
        summary: "Delete Device",
        description: "Removes a device.",
      },
    },
  )
  .get(
    "/devices/:id/state",
    async ({ params }) => {
      const device = await DeviceService.get(params.id);
      if (!device) return status(404, { error: "Device not found" });
      try {
        return await DeviceService.readState(device);
      } catch {
        return OFFLINE_STATE;
      }
    },
    {
      detail: {
        summary: "Get Device State",
        description:
          "Returns the device's live state. Falls back to offline state " +
          "when the device can't be reached.",
      },
    },
  )
  .post(
    "/devices/:id/command",
    async ({ params, body }) => {
      const device = await DeviceService.get(params.id);
      if (!device) return status(404, { error: "Device not found" });
      try {
        return await DeviceService.command(device, body);
      } catch (error) {
        return status(503, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    {
      detail: {
        summary: "Send Device Command",
        description:
          "Sends a command (power, brightness, colour, work mode or " +
          "channels) to a device.",
      },
      body: commandBody,
    },
  )
  .get(
    "/devices/:id/history",
    async ({ params, query }) =>
      StateService.getStateHistory(
        params.id,
        query.before ? new Date(query.before) : undefined,
      ),
    {
      detail: {
        summary: "Get Device History",
        description: "Returns the device's past states.",
      },
      query: historyQuery,
    },
  )
  .get(
    "/presets",
    async () => PresetService.list(),
    {
      detail: {
        summary: "List Presets",
        description: "Lists saved presets.",
      },
    },
  )
  .post("/presets", async ({ body }) => PresetService.create(body), {
    detail: {
      summary: "Create Preset",
      description: "Saves a new preset.",
    },
    body: presetBody,
  })
  .put(
    "/presets/:id",
    async ({ params, body }) => {
      const updated = await PresetService.update(params.id, body);
      if (!updated) return status(404, { error: "Preset not found" });
      return updated;
    },
    {
      detail: {
        summary: "Update Preset",
        description: "Updates a saved preset.",
      },
      body: presetUpdateBody,
    },
  )
  .delete(
    "/presets/:id",
    async ({ params }) => {
      await PresetService.delete(params.id);
      return { ok: true };
    },
    {
      detail: {
        summary: "Delete Preset",
        description: "Removes a saved preset.",
      },
    },
  )
  .post(
    "/presets/:id/apply",
    async ({ params, body }) => {
      const preset = await PresetService.get(params.id);
      if (!preset) return status(404, { error: "Preset not found" });
      const device = await DeviceService.get(body.deviceId);
      if (!device) return status(404, { error: "Device not found" });
      try {
        return await PresetService.apply(params.id, body.deviceId);
      } catch (error) {
        return status(503, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    {
      detail: {
        summary: "Apply Preset",
        description: "Applies a saved preset to a device.",
      },
      body: applyPresetBody,
    },
  )
  .get(
    "/sensors",
    async ({ query }) => {
      const all = await SensorService.list();
      const sensors =
        query.includeHidden === "true" ? all : all.filter((s) => !s.hidden);
      const latest = await SensorService.getLatestReadingsFor(
        sensors.map((sensor) => sensor.id),
      );
      return sensors.map((sensor) => ({
        ...sensor,
        readings: latest.get(sensor.id) ?? {},
      }));
    },
    {
      detail: {
        summary: "List Sensors",
        description:
          "Lists configured sensors with their latest readings. Hidden " +
          "sensors are left out unless includeHidden is set.",
      },
      query: includeHiddenQuery,
    },
  )
  .post("/sensors", async ({ body }) => SensorService.create(body), {
    detail: {
      summary: "Create Sensor",
      description: "Registers a new Tuya-connected sensor.",
    },
    body: sensorBody,
  })
  .put(
    "/sensors/:id",
    async ({ params, body }) => {
      const sensor = await SensorService.get(params.id);
      if (!sensor) return status(404, { error: "Sensor not found" });
      if (body.name !== undefined)
        await SensorService.rename(params.id, body.name);
      if (body.enabled !== undefined)
        await SensorService.setEnabled(params.id, body.enabled);
      if (body.hidden !== undefined)
        await SensorService.setHidden(params.id, body.hidden);
      return SensorService.get(params.id);
    },
    {
      detail: {
        summary: "Update Sensor",
        description: "Updates a sensor's name, enabled or hidden state.",
      },
      body: sensorUpdateBody,
    },
  )
  .delete(
    "/sensors/:id",
    async ({ params }) => {
      await SensorService.delete(params.id);
      return { ok: true };
    },
    {
      detail: {
        summary: "Delete Sensor",
        description: "Removes a sensor.",
      },
    },
  )
  .get(
    "/sensors/:id/history",
    async ({ params, query }) =>
      SensorService.getReadingHistory(params.id, {
        code: query.code,
        before: query.before ? new Date(query.before) : undefined,
      }),
    {
      detail: {
        summary: "Get Sensor History",
        description:
          "Returns the sensor's past readings, optionally filtered by " +
          "status code.",
      },
      query: sensorHistoryQuery,
    },
  );
