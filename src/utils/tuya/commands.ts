import {
    type DeviceState,
    type WorkMode,
    brightnessToRaw,
    colorTempToRaw,
    profileFor,
    switchChannelsToDps,
} from "utils/tuya/capabilities";
import { hexToTuyaColor } from "utils/tuya/color";
import type { Device } from "utils/tuya/devices";
import { getBulbType, readState, sendDps } from "utils/tuya/registry";
import type { TuyaDps } from "utils/tuya/protocol/types";

export interface DeviceCommand {
    power?: boolean;
    /** 0-100 */
    brightness?: number;
    /** 0-100 */
    colorTemp?: number;
    /** `#rrggbb` */
    colorHex?: string;
    workMode?: WorkMode;
    /** Switches only: relay states keyed by channel number. */
    channels?: Record<string, boolean>;
}

/**
 * Translates a normalised command into the data points this particular device understands,
 * then reads the resulting state back so callers always settle on what the device really did.
 */
export async function applyCommand(device: Device, command: DeviceCommand): Promise<DeviceState> {
    const dps =
        device.kind === "switch" ? buildSwitchDps(command) : await buildLampDps(device, command);

    if (Object.keys(dps).length === 0) {
        throw new Error("No supported command was given for this device");
    }

    await sendDps(device, dps);
    return readState(device);
}

function buildSwitchDps(command: DeviceCommand): TuyaDps {
    if (command.channels && Object.keys(command.channels).length > 0) {
        return switchChannelsToDps(command.channels);
    }
    // A single-gang switch is naturally driven by a plain on/off, so that maps to channel 1.
    if (command.power !== undefined) return switchChannelsToDps({ "1": command.power });
    return {};
}

async function buildLampDps(device: Device, command: DeviceCommand): Promise<TuyaDps> {
    const bulbType = await getBulbType(device);
    if (!bulbType) throw new Error(`Lamp ${device.name} has no known data point layout`);

    const profile = profileFor(bulbType);
    const dps: TuyaDps = {};

    if (command.power !== undefined) dps[profile.switch] = command.power;

    if (command.brightness !== undefined && profile.brightness) {
        dps[profile.brightness] = brightnessToRaw(bulbType, command.brightness);
    }

    if (command.colorTemp !== undefined && profile.colorTemp) {
        dps[profile.colorTemp] = colorTempToRaw(bulbType, command.colorTemp);
        // Temperature only takes effect in white mode, so switch the lamp over with it.
        if (profile.mode && command.workMode === undefined) dps[profile.mode] = "white";
    }

    if (command.colorHex !== undefined && profile.color) {
        const encoded = hexToTuyaColor(command.colorHex, profile.colorEncoding);
        if (!encoded) throw new Error(`Invalid colour "${command.colorHex}", expected #rrggbb`);
        dps[profile.color] = encoded;
        if (profile.mode && command.workMode === undefined) dps[profile.mode] = "colour";
    }

    if (command.workMode !== undefined && profile.mode) dps[profile.mode] = command.workMode;

    return dps;
}
