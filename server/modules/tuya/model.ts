import { z } from "zod";

export const WORK_MODES = ["white", "colour", "scene", "music"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

/** The highest relay channel any supported switch exposes. */
export const MAX_SWITCH_CHANNELS = 6;

export interface DeviceState {
  online: boolean;
  power: boolean | null;
  /** 0-100, normalised so the UI never sees the per-type raw ranges. */
  brightness: number | null;
  /** 0-100, normalised. */
  colorTemp: number | null;
  colorHex: string | null;
  workMode: WorkMode | null;
  /** Switches only: relay state keyed by channel number. */
  channels: Record<string, boolean> | null;
}

export const OFFLINE_STATE: DeviceState = {
  online: false,
  power: null,
  brightness: null,
  colorTemp: null,
  colorHex: null,
  workMode: null,
  channels: null,
};

export function statesEqual(a: DeviceState, b: DeviceState): boolean {
  return (
    a.online === b.online &&
    a.power === b.power &&
    a.brightness === b.brightness &&
    a.colorTemp === b.colorTemp &&
    a.colorHex === b.colorHex &&
    a.workMode === b.workMode &&
    JSON.stringify(a.channels) === JSON.stringify(b.channels)
  );
}

export function percentToRaw(
  percent: number,
  min: number,
  max: number,
): number {
  const bounded = Math.min(100, Math.max(0, percent));
  return Math.round(min + (bounded / 100) * (max - min));
}

export const deviceBody = z.object({
  name: z.string().min(1).meta({
    title: "Name",
    description: "Display name for the device",
    example: "Living Room Lamp",
  }),
  tuyaDeviceId: z.string().min(1).meta({
    title: "Tuya Device ID",
    description: "The device's ID in the Tuya Cloud API",
    example: "eb1234567890abcdef1234",
  }),
  kind: z.enum(["lamp", "switch"]).optional().meta({
    title: "Kind",
    description: "Device type. Defaults to lamp when left out",
    example: "lamp",
  }),
  channelCount: z.number().int().positive().nullable().optional().meta({
    title: "Channel Count",
    description: "Switches only: number of relay channels the device exposes",
    example: 2,
  }),
  enabled: z.boolean().optional().meta({
    title: "Enabled",
    description: "Whether the device is active and polled for state",
    example: true,
  }),
  hidden: z.boolean().optional().meta({
    title: "Hidden",
    description: "Whether the device is hidden from the default listing",
    example: false,
  }),
});
export const deviceUpdateBody = deviceBody.partial();

export const commandBody = z
  .object({
    power: z.boolean().optional().meta({
      title: "Power",
      description: "Turn the device on or off",
      example: true,
    }),
    brightness: z.number().min(0).max(100).optional().meta({
      title: "Brightness",
      description: "0-100, normalised brightness",
      example: 80,
    }),
    colorTemp: z.number().min(0).max(100).optional().meta({
      title: "Color Temperature",
      description: "0-100, normalised colour temperature",
      example: 50,
    }),
    colorHex: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Expected a #rrggbb colour")
      .optional()
      .meta({
        title: "Colour",
        description: "Target colour as a #rrggbb hex string",
        example: "#ff8800",
      }),
    workMode: z.enum(WORK_MODES).optional().meta({
      title: "Work Mode",
      description: "The device's operating mode",
      example: "colour",
    }),
    channels: z.record(z.string(), z.boolean()).optional().meta({
      title: "Channels",
      description: "Switches only: relay on/off state keyed by channel number",
      example: { "1": true, "2": false },
    }),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );
/** The single source of truth for a command's shape — the HTTP body schema and the type. */
export type DeviceCommand = z.infer<typeof commandBody>;

export const presetBody = z.object({
  name: z.string().min(1).meta({
    title: "Name",
    description: "Display name for the preset",
    example: "Reading",
  }),
  power: z.boolean().optional().meta({
    title: "Power",
    description: "Turn the device on or off when the preset is applied",
    example: true,
  }),
  brightness: z.number().min(0).max(100).nullable().optional().meta({
    title: "Brightness",
    description: "0-100, normalised brightness",
    example: 60,
  }),
  colorTemp: z.number().min(0).max(100).nullable().optional().meta({
    title: "Color Temperature",
    description: "0-100, normalised colour temperature",
    example: 40,
  }),
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Expected a #rrggbb colour")
    .nullable()
    .optional()
    .meta({
      title: "Colour",
      description: "Target colour as a #rrggbb hex string",
      example: "#ffcc66",
    }),
  // A saved preset is never "scene"/"music" — those are Tuya's own native bulb work modes.
  workMode: z.enum(["white", "colour"]).nullable().optional().meta({
    title: "Work Mode",
    description: "The device's operating mode when the preset is applied",
    example: "white",
  }),
});
export const presetUpdateBody = presetBody.partial();
export const applyPresetBody = z.object({
  deviceId: z.string().min(1).meta({
    title: "Device ID",
    description: "The device to apply the preset to",
    example: "eb1234567890abcdef1234",
  }),
});

export const sensorBody = z.object({
  name: z.string().min(1).meta({
    title: "Name",
    description: "Display name for the sensor",
    example: "Front Door",
  }),
  tuyaDeviceId: z.string().min(1).meta({
    title: "Tuya Device ID",
    description: "The sensor's ID in the Tuya Cloud API",
    example: "eb0987654321fedcba0987",
  }),
  kind: z
    .enum(["temperature_humidity", "door", "motion", "unknown"])
    .optional()
    .meta({
      title: "Kind",
      description: "Sensor type. Defaults to unknown when left out",
      example: "door",
    }),
  category: z.string().nullable().optional().meta({
    title: "Category",
    description: "Tuya product category code",
    example: "mcs",
  }),
  enabled: z.boolean().optional().meta({
    title: "Enabled",
    description: "Whether the sensor is active and polled for state",
    example: true,
  }),
  hidden: z.boolean().optional().meta({
    title: "Hidden",
    description: "Whether the sensor is hidden from the default listing",
    example: false,
  }),
});
export const sensorUpdateBody = z.object({
  name: z.string().min(1).optional().meta({
    title: "Name",
    description: "Display name for the sensor",
    example: "Front Door",
  }),
  enabled: z.boolean().optional().meta({
    title: "Enabled",
    description: "Whether the sensor is active and polled for state",
    example: true,
  }),
  hidden: z.boolean().optional().meta({
    title: "Hidden",
    description: "Whether the sensor is hidden from the default listing",
    example: false,
  }),
});

export const includeHiddenQuery = z.object({
  includeHidden: z.string().optional().meta({
    title: "Include Hidden",
    description: "Any truthy string includes hidden devices/sensors in the listing",
    example: "true",
  }),
});
export const historyQuery = z.object({
  before: z.string().optional().meta({
    title: "Before",
    description: "ISO timestamp cursor; returns history entries older than this",
    example: "2026-09-26T12:00:00.000Z",
  }),
});
export const sensorHistoryQuery = z.object({
  code: z.string().optional().meta({
    title: "Code",
    description: "Filter history to a single Tuya status code",
    example: "va_temperature",
  }),
  before: z.string().optional().meta({
    title: "Before",
    description: "ISO timestamp cursor; returns history entries older than this",
    example: "2026-09-26T12:00:00.000Z",
  }),
});
