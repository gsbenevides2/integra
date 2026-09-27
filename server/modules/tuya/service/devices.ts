import { db } from "@server/db";
import { tuyaDevices } from "@server/db/schema";

import { asc, eq } from "drizzle-orm";

import type { DeviceCommand, DeviceState } from "../model";
import {
  getDeviceDetail,
  getDevicesStatus,
  getDeviceStatus,
  sendDeviceCommands,
} from "./cloud/client";
import {
  cloudStatusToDeviceState,
  cloudStatusToSwitchState,
  deviceCommandToCloudCommands,
  switchChannelsToCloudCommands,
} from "./cloud/deviceState";

export type Device = typeof tuyaDevices.$inferSelect;
export type PublicDevice = Device;

export interface DeviceWithState extends PublicDevice {
  state: DeviceState;
}

export interface DeviceInput {
  name: string;
  tuyaDeviceId: string;
  kind?: Device["kind"];
  channelCount?: number | null;
  enabled?: boolean;
  hidden?: boolean;
}

export abstract class DeviceService {
  static async list(): Promise<PublicDevice[]> {
    return db.select().from(tuyaDevices).orderBy(asc(tuyaDevices.id));
  }

  static async listEnabled(): Promise<Device[]> {
    return db.select().from(tuyaDevices).where(eq(tuyaDevices.enabled, true));
  }

  static async get(id: string): Promise<Device | null> {
    const [device] = await db
      .select()
      .from(tuyaDevices)
      .where(eq(tuyaDevices.id, id))
      .limit(1);
    return device ?? null;
  }

  static async getOrThrow(id: string): Promise<Device> {
    const device = await DeviceService.get(id);
    if (!device) throw new Error(`Device ${id} not found`);
    return device;
  }

  static async getByTuyaId(tuyaDeviceId: string): Promise<Device | null> {
    const [device] = await db
      .select()
      .from(tuyaDevices)
      .where(eq(tuyaDevices.tuyaDeviceId, tuyaDeviceId))
      .limit(1);
    return device ?? null;
  }

  /** The only way a device is registered now: pasting in its Tuya `deviceId` by hand. */
  static async create(input: DeviceInput): Promise<PublicDevice> {
    const [created] = await db
      .insert(tuyaDevices)
      .values({
        name: input.name,
        tuyaDeviceId: input.tuyaDeviceId,
        kind: input.kind ?? "lamp",
        channelCount: input.channelCount ?? null,
        enabled: input.enabled ?? true,
      })
      .returning();

    if (!created) throw new Error("Device not created");
    return created;
  }

  static async update(
    id: string,
    input: Partial<DeviceInput>,
  ): Promise<PublicDevice | null> {
    const changes: Partial<typeof tuyaDevices.$inferInsert> = {};

    if (input.name !== undefined) changes.name = input.name;
    if (input.tuyaDeviceId !== undefined)
      changes.tuyaDeviceId = input.tuyaDeviceId;
    if (input.kind !== undefined) changes.kind = input.kind;
    if (input.channelCount !== undefined)
      changes.channelCount = input.channelCount;
    if (input.enabled !== undefined) changes.enabled = input.enabled;
    if (input.hidden !== undefined) changes.hidden = input.hidden;

    if (Object.keys(changes).length === 0) return DeviceService.get(id);

    const [updated] = await db
      .update(tuyaDevices)
      .set(changes)
      .where(eq(tuyaDevices.id, id))
      .returning();

    return updated ?? null;
  }

  static async delete(id: string): Promise<void> {
    await db.delete(tuyaDevices).where(eq(tuyaDevices.id, id));
  }

  static async readState(device: Device): Promise<DeviceState> {
    const [status, detail] = await Promise.all([
      getDeviceStatus(device.tuyaDeviceId),
      getDeviceDetail(device.tuyaDeviceId),
    ]);
    return DeviceService.stateFromCloud(device, status, detail.online);
  }

  /** Reads a whole set of devices from the cloud in one call, however many there are. */
  static async readAllStates(
    devices: Device[],
  ): Promise<Map<string, DeviceState>> {
    if (devices.length === 0) return new Map();

    const statuses = await getDevicesStatus(
      devices.map((device) => device.tuyaDeviceId),
    );

    const states = new Map<string, DeviceState>();
    for (const device of devices) {
      const status = statuses.get(device.tuyaDeviceId) ?? [];
      states.set(
        device.id,
        DeviceService.stateFromCloud(device, status, status.length > 0),
      );
    }
    return states;
  }

  static async command(
    device: Device,
    command: DeviceCommand,
  ): Promise<DeviceState> {
    const status = await getDeviceStatus(device.tuyaDeviceId);
    const commands =
      device.kind === "switch"
        ? switchChannelsToCloudCommands(DeviceService.channelsFor(command))
        : deviceCommandToCloudCommands(command, status);
    if (commands.length === 0) {
      throw new Error("No supported command was given for this device");
    }

    await sendDeviceCommands(device.tuyaDeviceId, commands);

    // Tuya's status shadow trails the command by a second or two, so reading it back here
    // would return the value from before the change and make the UI snap backwards. The
    // cloud accepted the command, so the commanded values are the truthful answer; Pulsar
    // reconciles against the device's own report either way.
    const previous =
      device.kind === "switch"
        ? cloudStatusToSwitchState(status, true)
        : cloudStatusToDeviceState(status, true);
    return DeviceService.applyCommandToState(previous, command);
  }

  private static stateFromCloud(
    device: Device,
    status: Awaited<ReturnType<typeof getDeviceStatus>>,
    online: boolean,
  ): DeviceState {
    return device.kind === "switch"
      ? cloudStatusToSwitchState(status, online)
      : cloudStatusToDeviceState(status, online);
  }

  /** A single-gang switch is driven by a plain on/off, which means channel 1. */
  private static channelsFor(command: DeviceCommand): Record<string, boolean> {
    if (command.channels && Object.keys(command.channels).length > 0)
      return command.channels;
    if (command.power !== undefined) return { "1": command.power };
    return {};
  }

  private static applyCommandToState(
    state: DeviceState,
    command: DeviceCommand,
  ): DeviceState {
    if (state.channels) {
      return {
        ...state,
        channels: { ...state.channels, ...DeviceService.channelsFor(command) },
      };
    }
    return {
      ...state,
      power: command.power ?? state.power,
      brightness: command.brightness ?? state.brightness,
      colorTemp: command.colorTemp ?? state.colorTemp,
      colorHex: command.colorHex ?? state.colorHex,
      workMode:
        command.workMode ??
        (command.colorHex !== undefined
          ? "colour"
          : command.colorTemp !== undefined
            ? "white"
            : state.workMode),
    };
  }
}
