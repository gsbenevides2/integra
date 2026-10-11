import {
  authz,
  currentUser,
  grantAllValidActions,
  readableResourceIds,
  revokeResourceGrants,
} from "@server/shared/authz";

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

const DEVICE_AS_SENSOR = {
  error: "Tuya device ID already registered as a sensor",
};
const SENSOR_AS_DEVICE = {
  error: "Tuya device ID already registered as a device",
};

export const tuyaRoutes = new Elysia({
  prefix: "/api/tuya",
  detail: {
    tags: ["Tuya"],
  },
})
  .use(authz)
  .get(
    "/devices",
    async (ctx): Promise<DeviceWithState[]> => {
      const user = currentUser(ctx);
      const readable = await readableResourceIds(user.id, "tuya_device");
      const all = await DeviceService.list();
      const devices = (
        ctx.query.includeHidden === "true" ? all : all.filter((d) => !d.hidden)
      ).filter((device) => readable.has(device.id));
      const states = await StateService.getLatestStates(
        devices.map((device) => device.id),
      );
      return devices.map((device) => ({
        ...device,
        state: states.get(device.id) ?? OFFLINE_STATE,
      }));
    },
    {
      detail: {
        summary: "List Devices",
        description:
          "Lists configured devices with their latest known state. Hidden " +
          "devices are left out unless includeHidden is set. Only devices the " +
          "user can read are returned.",
      },
      query: includeHiddenQuery,
    },
  )
  .post(
    "/devices",
    async (ctx) => {
      const user = currentUser(ctx);
      const conflict = await SensorService.getByTuyaId(ctx.body.tuyaDeviceId);
      if (conflict) return status(400, DEVICE_AS_SENSOR);
      const created = await DeviceService.create(ctx.body);
      await grantAllValidActions(user.id, "tuya_device", created.id);
      return created;
    },
    {
      detail: {
        summary: "Create Device",
        description:
          "Registers a new Tuya-connected device. The creator gets read and write.",
      },
      body: deviceBody,
    },
  )
  .put(
    "/devices/:id",
    async ({ params, body }) => {
      if (body.tuyaDeviceId !== undefined) {
        const conflict = await SensorService.getByTuyaId(body.tuyaDeviceId);
        if (conflict) return status(400, DEVICE_AS_SENSOR);
      }
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
      await revokeResourceGrants("tuya_device", params.id);
      return { ok: true };
    },
    {
      detail: {
        summary: "Delete Device",
        description: "Removes a device and its resource grants.",
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
    async (ctx) => {
      const user = currentUser(ctx);
      const readable = await readableResourceIds(user.id, "tuya_preset");
      const all = await PresetService.list();
      return all.filter((preset) => readable.has(preset.id));
    },
    {
      detail: {
        summary: "List Presets",
        description: "Lists saved presets the user can read.",
      },
    },
  )
  .post(
    "/presets",
    async (ctx) => {
      const user = currentUser(ctx);
      const created = await PresetService.create(ctx.body);
      await grantAllValidActions(user.id, "tuya_preset", created.id);
      return created;
    },
    {
      detail: {
        summary: "Create Preset",
        description:
          "Saves a new preset. The creator gets read, write and apply.",
      },
      body: presetBody,
    },
  )
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
      await revokeResourceGrants("tuya_preset", params.id);
      return { ok: true };
    },
    {
      detail: {
        summary: "Delete Preset",
        description: "Removes a saved preset and its resource grants.",
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
    async (ctx) => {
      const user = currentUser(ctx);
      const readable = await readableResourceIds(user.id, "tuya_sensor");
      const all = await SensorService.list();
      const sensors = (
        ctx.query.includeHidden === "true" ? all : all.filter((s) => !s.hidden)
      ).filter((sensor) => readable.has(sensor.id));
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
          "sensors are left out unless includeHidden is set. Only sensors the " +
          "user can read are returned.",
      },
      query: includeHiddenQuery,
    },
  )
  .post(
    "/sensors",
    async (ctx) => {
      const user = currentUser(ctx);
      const conflict = await DeviceService.getByTuyaId(ctx.body.tuyaDeviceId);
      if (conflict) return status(400, SENSOR_AS_DEVICE);
      const created = await SensorService.create(ctx.body);
      await grantAllValidActions(user.id, "tuya_sensor", created.id);
      return created;
    },
    {
      detail: {
        summary: "Create Sensor",
        description:
          "Registers a new Tuya-connected sensor. The creator gets read and write.",
      },
      body: sensorBody,
    },
  )
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
      await revokeResourceGrants("tuya_sensor", params.id);
      return { ok: true };
    },
    {
      detail: {
        summary: "Delete Sensor",
        description: "Removes a sensor and its resource grants.",
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
