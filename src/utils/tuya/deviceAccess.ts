import { DONT_TRACE_ID } from "core/instrumentation";
import type { DeviceState } from "utils/tuya/capabilities";
import { getDeviceDetail, getDeviceStatus, sendDeviceCommands } from "utils/tuya/cloud/client";
import {
    cloudStatusToDeviceState,
    cloudStatusToSwitchState,
    deviceCommandToCloudCommands,
    switchChannelsToCloudCommands,
} from "utils/tuya/cloud/deviceState";
import { applyCommand, type DeviceCommand } from "utils/tuya/commands";
import type { Device } from "utils/tuya/devices";
import { dropConnection, readState } from "utils/tuya/registry";

export type DeviceTransport = "local" | "cloud";

export interface DeviceAccessResult {
    state: DeviceState;
    transport: DeviceTransport;
}

/**
 * The LAN path is instantaneous and keeps working when the internet is down, so it is always
 * tried first. The cloud covers the rest: a device on another network, one that dropped off
 * Wi-Fi discovery, or a bulb whose local key went stale after a re-pair.
 */
export async function readDeviceState(
    device: Device,
    traceId: string,
): Promise<DeviceAccessResult> {
    try {
        return { state: await readState(device), transport: "local" };
    } catch {
        dropConnection(device.id);
        return { state: await readLampStateFromCloud(device, traceId), transport: "cloud" };
    }
}

export async function commandDevice(
    device: Device,
    command: DeviceCommand,
    traceId: string,
): Promise<DeviceAccessResult> {
    try {
        return { state: await applyCommand(device, command), transport: "local" };
    } catch (localError) {
        dropConnection(device.id);
        try {
            return {
                state: await commandLampViaCloud(device, command, traceId),
                transport: "cloud",
            };
        } catch (cloudError) {
            // Surface both, since "it did not work" is far less useful than knowing the LAN
            // timed out but the cloud rejected the colour value.
            throw new Error(`Local: ${messageOf(localError)} | Cloud: ${messageOf(cloudError)}`);
        }
    }
}

async function readLampStateFromCloud(device: Device, traceId: string): Promise<DeviceState> {
    const [status, detail] = await Promise.all([
        getDeviceStatus(device.tuyaDeviceId, traceId),
        getDeviceDetail(device.tuyaDeviceId, traceId),
    ]);
    return cloudStatusToDeviceState(status, detail.online);
}

async function commandLampViaCloud(
    device: Device,
    command: DeviceCommand,
    traceId: string,
): Promise<DeviceState> {
    const status = await getDeviceStatus(device.tuyaDeviceId, traceId);
    const commands =
        device.kind === "switch"
            ? switchChannelsToCloudCommands(channelsFor(command))
            : deviceCommandToCloudCommands(command, status);
    if (commands.length === 0) {
        throw new Error("No supported command was given for this device");
    }

    await sendDeviceCommands(device.tuyaDeviceId, commands, traceId);

    // Tuya's status shadow trails the command by a second or two, so reading it back here
    // would return the value from before the change and make the UI snap backwards. The
    // cloud accepted the command, so the commanded values are the truthful answer; the next
    // poll reconciles against the device either way.
    const previous =
        device.kind === "switch"
            ? cloudStatusToSwitchState(status, true)
            : cloudStatusToDeviceState(status, true);
    return applyCommandToState(previous, command);
}

/** A single-gang switch is driven by a plain on/off, which means channel 1. */
function channelsFor(command: DeviceCommand): Record<string, boolean> {
    if (command.channels && Object.keys(command.channels).length > 0) return command.channels;
    if (command.power !== undefined) return { "1": command.power };
    return {};
}

function applyCommandToState(state: DeviceState, command: DeviceCommand): DeviceState {
    if (state.channels) {
        return { ...state, channels: { ...state.channels, ...channelsFor(command) } };
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

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** For callers with no trace of their own, such as the dashboard's polling routes. */
export const UNTRACED = DONT_TRACE_ID;
