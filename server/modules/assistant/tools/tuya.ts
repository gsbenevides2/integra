import {
  type DeviceCommand,
  type DeviceState,
  OFFLINE_STATE,
} from "@server/modules/tuya/model";
import { type Device, DeviceService } from "@server/modules/tuya/service/devices";
import { PresetService } from "@server/modules/tuya/service/presets";
import { SensorService } from "@server/modules/tuya/service/sensors";
import { StateService } from "@server/modules/tuya/service/state";
import { hasResourceGrant, readableResourceIds } from "@server/shared/authz";

import { z } from "zod";

import {
  findByName,
  guardedTool,
  isToolError,
  NO_PERMISSION,
  type ToolContext,
  type ToolError,
} from "./guard";

const LIST_DEVICES = "GET /api/tuya/devices";
const COMMAND = "POST /api/tuya/devices/:id/command";
const LIST_PRESETS = "GET /api/tuya/presets";
const APPLY_PRESET = "POST /api/tuya/presets/:id/apply";
const LIST_SENSORS = "GET /api/tuya/sensors";

const commandInput = {
  power: z.boolean().optional().describe("true liga, false desliga"),
  brightness: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Brilho de 0 a 100 (só lâmpadas)"),
  colorTemp: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Temperatura de cor de 0 (quente) a 100 (fria) (só lâmpadas)"),
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .describe("Cor no formato #rrggbb (só lâmpadas)"),
  channel: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Interruptores com vários canais: qual canal ligar/desligar"),
};

/** Visible devices the user can read, with their last known state. */
async function readableDevices(ctx: ToolContext) {
  const readable = await readableResourceIds(ctx.user.id, "tuya_device");
  const devices = (await DeviceService.list()).filter(
    (device) => !device.hidden && readable.has(device.id),
  );
  const states = await StateService.getLatestStates(devices.map((d) => d.id));
  return devices.map((device) => ({
    device,
    state: states.get(device.id) ?? OFFLINE_STATE,
  }));
}

/** A plain on/off on a multi-gang switch means every channel. */
export function toDeviceCommand(
  device: Device,
  input: { power?: boolean; brightness?: number; colorTemp?: number; colorHex?: string; channel?: number },
): DeviceCommand | ToolError {
  if (device.kind === "switch") {
    if (input.power === undefined) {
      return { error: `${device.name} é um interruptor: só liga ou desliga.` };
    }
    const count = device.channelCount ?? 1;
    const channels = input.channel
      ? [input.channel]
      : Array.from({ length: count }, (_, i) => i + 1);
    return {
      channels: Object.fromEntries(
        channels.map((channel) => [String(channel), input.power!]),
      ),
    };
  }
  const command: DeviceCommand = {};
  if (input.power !== undefined) command.power = input.power;
  if (input.brightness !== undefined) command.brightness = input.brightness;
  if (input.colorTemp !== undefined) command.colorTemp = input.colorTemp;
  if (input.colorHex !== undefined) command.colorHex = input.colorHex;
  // Changing brightness or colour of an off lamp should also turn it on.
  if (command.power === undefined && Object.keys(command).length > 0) {
    command.power = true;
  }
  if (Object.keys(command).length === 0) {
    return { error: "Nenhuma alteração foi pedida." };
  }
  return command;
}

function describeState(state: DeviceState) {
  return {
    online: state.online,
    ligado: state.channels
      ? Object.values(state.channels).some(Boolean)
      : state.power,
    brilho: state.brightness,
    temperaturaCor: state.colorTemp,
    cor: state.colorHex,
    canais: state.channels,
  };
}

async function commandDevice(
  ctx: ToolContext,
  device: Device,
  input: Parameters<typeof toDeviceCommand>[1],
) {
  if (!(await hasResourceGrant(ctx.user.id, "tuya_device", device.id, "write"))) {
    return NO_PERMISSION;
  }
  const command = toDeviceCommand(device, input);
  if (isToolError(command)) return command;
  const state = await DeviceService.command(device, command);
  return { dispositivo: device.name, ...describeState(state) };
}

export function tuyaTools(ctx: ToolContext) {
  return [
    guardedTool(ctx, {
      name: "listar_dispositivos",
      description:
        "Lista as lâmpadas e interruptores da casa com o estado atual (ligado, brilho, cor, online).",
      routeKeys: [LIST_DEVICES],
      inputSchema: z.object({}),
      execute: async () => ({
        dispositivos: (await readableDevices(ctx)).map(({ device, state }) => ({
          nome: device.name,
          tipo: device.kind === "switch" ? "interruptor" : "lâmpada",
          quantidadeCanais: device.channelCount,
          ...describeState(state),
        })),
      }),
      summarize: (_input, output) =>
        `Consultou ${output.dispositivos.length} dispositivos`,
    }),
    guardedTool(ctx, {
      name: "controlar_dispositivo",
      description:
        "Liga, desliga ou ajusta brilho/cor de UMA lâmpada ou interruptor pelo nome.",
      routeKeys: [LIST_DEVICES, COMMAND],
      inputSchema: z.object({
        dispositivo: z.string().describe("Nome do dispositivo, como o usuário falou"),
        ...commandInput,
      }),
      execute: async ({ dispositivo, ...input }) => {
        const found = findByName(
          (await readableDevices(ctx)).map((d) => d.device),
          dispositivo,
          "dispositivo",
        );
        if (isToolError(found)) return found;
        return commandDevice(ctx, found, input);
      },
      summarize: (input, output) =>
        input.power === false
          ? `Desligou ${output.dispositivo}`
          : `Ajustou ${output.dispositivo}`,
    }),
    guardedTool(ctx, {
      name: "controlar_varios_dispositivos",
      description:
        "Liga ou desliga vários dispositivos de uma vez. Sem lista de nomes, age em todos (ex.: 'apaga tudo').",
      routeKeys: [LIST_DEVICES, COMMAND],
      inputSchema: z.object({
        dispositivos: z
          .array(z.string())
          .optional()
          .describe("Nomes dos dispositivos; omita para todos"),
        power: z.boolean().describe("true liga, false desliga"),
      }),
      execute: async ({ dispositivos, power }) => {
        const all = (await readableDevices(ctx))
          .filter(({ state }) => state.online)
          .map((d) => d.device);
        const targets = dispositivos
          ? dispositivos.map((name) => findByName(all, name, "dispositivo"))
          : all;
        const results = await Promise.all(
          targets.map(async (target) => {
            if (isToolError(target)) return target;
            return commandDevice(ctx, target, { power }).catch(
              (error: unknown): ToolError => ({
                error: `${target.name}: ${error instanceof Error ? error.message : String(error)}`,
              }),
            );
          }),
        );
        return {
          sucesso: results.filter((r) => !isToolError(r)).map((r) => (r as { dispositivo: string }).dispositivo),
          falhas: results.filter(isToolError).map((r) => r.error),
        };
      },
      summarize: (input, output) =>
        `${input.power ? "Ligou" : "Desligou"} ${output.sucesso.length} dispositivos`,
    }),
    guardedTool(ctx, {
      name: "listar_cenas",
      description: "Lista as cenas (presets de iluminação) salvas.",
      routeKeys: [LIST_PRESETS],
      inputSchema: z.object({}),
      execute: async () => {
        const readable = await readableResourceIds(ctx.user.id, "tuya_preset");
        const presets = (await PresetService.list()).filter((p) => readable.has(p.id));
        return {
          cenas: presets.map((p) => ({
            nome: p.name,
            ligado: p.power,
            brilho: p.brightness,
            cor: p.colorHex,
          })),
        };
      },
      summarize: (_input, output) => `Consultou ${output.cenas.length} cenas`,
    }),
    guardedTool(ctx, {
      name: "aplicar_cena",
      description: "Aplica uma cena salva a um dispositivo.",
      routeKeys: [LIST_DEVICES, LIST_PRESETS, APPLY_PRESET],
      inputSchema: z.object({
        cena: z.string().describe("Nome da cena"),
        dispositivo: z.string().describe("Nome do dispositivo"),
      }),
      execute: async ({ cena, dispositivo }) => {
        const readablePresets = await readableResourceIds(ctx.user.id, "tuya_preset");
        const preset = findByName(
          (await PresetService.list()).filter((p) => readablePresets.has(p.id)),
          cena,
          "cena",
        );
        if (isToolError(preset)) return preset;
        const device = findByName(
          (await readableDevices(ctx)).map((d) => d.device),
          dispositivo,
          "dispositivo",
        );
        if (isToolError(device)) return device;
        const allowed =
          (await hasResourceGrant(ctx.user.id, "tuya_preset", preset.id, "apply")) &&
          (await hasResourceGrant(ctx.user.id, "tuya_device", device.id, "write"));
        if (!allowed) return NO_PERMISSION;
        const state = await PresetService.apply(preset.id, device.id);
        return { cena: preset.name, dispositivo: device.name, ...describeState(state) };
      },
      summarize: (_input, output) =>
        `Aplicou ${output.cena} em ${output.dispositivo}`,
    }),
    guardedTool(ctx, {
      name: "ler_sensores",
      description:
        "Lê os sensores da casa (temperatura, umidade, porta, movimento etc.) com as últimas leituras.",
      routeKeys: [LIST_SENSORS],
      inputSchema: z.object({}),
      execute: async () => {
        const readable = await readableResourceIds(ctx.user.id, "tuya_sensor");
        const sensors = (await SensorService.list()).filter(
          (s) => !s.hidden && readable.has(s.id),
        );
        const readings = await SensorService.getLatestReadingsFor(sensors.map((s) => s.id));
        return {
          sensores: sensors.map((s) => ({
            nome: s.name,
            tipo: s.kind,
            online: s.online,
            leituras: readings.get(s.id) ?? {},
          })),
        };
      },
      summarize: (_input, output) => `Leu ${output.sensores.length} sensores`,
    }),
  ];
}
