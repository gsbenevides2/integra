import type { DeviceState } from "@server/modules/tuya/model";
import type { Device } from "@server/modules/tuya/service/devices";
import type { Preset } from "@server/modules/tuya/service/presets";
import type { Sensor } from "@server/modules/tuya/service/sensors";
import * as authz from "@server/shared/authz";

import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { makeContext, provideEnv, runTool, TUYA_ENV } from "./helpers";

afterAll(provideEnv(TUYA_ENV));

const { NO_PERMISSION } = await import("@server/modules/assistant/tools/guard");
const { toDeviceCommand, tuyaTools } = await import("@server/modules/assistant/tools/tuya");
const { OFFLINE_STATE } = await import("@server/modules/tuya/model");
const { DeviceService } = await import("@server/modules/tuya/service/devices");
const { PresetService } = await import("@server/modules/tuya/service/presets");
const { SensorService } = await import("@server/modules/tuya/service/sensors");
const { StateService } = await import("@server/modules/tuya/service/state");

const base = { tuyaDeviceId: "t", enabled: true, hidden: false, lastSeenAt: null, createdAt: new Date() };
const lamp: Device = { ...base, id: "lamp", name: "Luz da Sala", kind: "lamp", channelCount: null };
const plug: Device = { ...base, id: "plug", name: "Tomada", kind: "switch", channelCount: 2 };
const hidden: Device = { ...base, id: "hid", name: "Escondida", kind: "lamp", channelCount: null, hidden: true };
const offline: Device = { ...base, id: "off", name: "Varanda", kind: "lamp", channelCount: null };
const ON = { ...OFFLINE_STATE, online: true, power: true, brightness: 80 };
const preset: Preset = {
  id: "p1", name: "Leitura", power: true, brightness: 70, colorTemp: 30, colorHex: null, workMode: "white", createdAt: new Date(),
};

const spies: { mockRestore: () => void }[] = [];
const spy = <T extends object, K extends keyof T>(obj: T, key: K) => {
  const s = spyOn(obj, key as never) as unknown as ReturnType<typeof spyOn>;
  spies.push(s);
  return s;
};
let writable: Set<string>;
let commands: { id: string; command: unknown }[];

beforeEach(() => {
  writable = new Set(["lamp", "plug", "off", "p1"]);
  commands = [];
  spy(authz, "hasRouteGrant").mockResolvedValue(true);
  spy(authz, "readableResourceIds").mockResolvedValue(new Set(["lamp", "plug", "hid", "off", "p1", "s1"]));
  spy(authz, "hasResourceGrant").mockImplementation(async (_u: string, _t: string, id: string) => writable.has(id));
  spy(DeviceService, "list").mockResolvedValue([lamp, plug, hidden, offline]);
  spy(StateService, "getLatestStates").mockResolvedValue(
    new Map<string, DeviceState>([["lamp", ON], ["plug", { ...OFFLINE_STATE, online: true, channels: { "1": false, "2": true } }]]),
  );
  spy(DeviceService, "command").mockImplementation(async (device: Device, command: unknown) => {
    commands.push({ id: device.id, command });
    if (device.id === "off") throw new Error("offline");
    return ON;
  });
});
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

describe("toDeviceCommand", () => {
  test("switches only take power, applied to every channel unless one is named", () => {
    expect(toDeviceCommand(plug, { power: false })).toEqual({ channels: { "1": false, "2": false } });
    expect(toDeviceCommand(plug, { power: true, channel: 2 })).toEqual({ channels: { "2": true } });
    expect(toDeviceCommand({ ...plug, channelCount: null }, { power: true })).toEqual({ channels: { "1": true } });
    expect(toDeviceCommand(plug, { brightness: 10 })).toEqual({ error: "Tomada é um interruptor: só liga ou desliga." });
  });

  test("lamp adjustments turn the lamp on, and an empty request is an error", () => {
    expect(toDeviceCommand(lamp, { brightness: 10, colorTemp: 20, colorHex: "#ff0000" })).toEqual({
      brightness: 10, colorTemp: 20, colorHex: "#ff0000", power: true,
    });
    expect(toDeviceCommand(lamp, { power: false })).toEqual({ power: false });
    expect(toDeviceCommand(lamp, {})).toEqual({ error: "Nenhuma alteração foi pedida." });
  });
});

describe("tuya tools", () => {
  test("listar_dispositivos lists visible, readable devices with state", async () => {
    const ctx = makeContext();
    const result = await runTool(tuyaTools(ctx), "listar_dispositivos");
    const names = (result.dispositivos as { nome: string }[]).map((d) => d.nome);
    expect(names).toEqual(["Luz da Sala", "Tomada", "Varanda"]);
    expect(result.dispositivos).toContainEqual(expect.objectContaining({ nome: "Tomada", tipo: "interruptor", ligado: true }));
    expect(result.dispositivos).toContainEqual(expect.objectContaining({ nome: "Varanda", online: false }));
    expect(ctx.actions[0]?.summary).toBe("Consultou 3 dispositivos");
  });

  test("controlar_dispositivo resolves the name and sends the command", async () => {
    const ctx = makeContext();
    const tools = tuyaTools(ctx);
    expect(await runTool(tools, "controlar_dispositivo", { dispositivo: "sala", power: false })).toMatchObject({
      dispositivo: "Luz da Sala", ligado: true, brilho: 80,
    });
    expect(commands).toEqual([{ id: "lamp", command: { power: false } }]);
    await runTool(tools, "controlar_dispositivo", { dispositivo: "sala", brightness: 30 });
    expect(ctx.actions.map((a) => a.summary)).toEqual(["Desligou Luz da Sala", "Ajustou Luz da Sala"]);
  });

  test("controlar_dispositivo reports unknown names, bad commands and missing write grants", async () => {
    const tools = tuyaTools(makeContext());
    expect(await runTool(tools, "controlar_dispositivo", { dispositivo: "garagem", power: true })).toHaveProperty("error");
    expect(await runTool(tools, "controlar_dispositivo", { dispositivo: "tomada", brightness: 3 })).toHaveProperty("error");
    writable.delete("lamp");
    expect(await runTool(tools, "controlar_dispositivo", { dispositivo: "sala", power: true })).toEqual(NO_PERMISSION);
    expect(commands).toEqual([]);
  });

  test("controlar_varios_dispositivos acts on all online devices or a named list", async () => {
    const ctx = makeContext();
    const tools = tuyaTools(ctx);
    expect(await runTool(tools, "controlar_varios_dispositivos", { power: false })).toEqual({
      sucesso: ["Luz da Sala", "Tomada"], falhas: [],
    });
    expect(ctx.actions[0]?.summary).toBe("Desligou 2 dispositivos");

    // Offline devices are skipped from "all", so name one via a fresh state map.
    (StateService.getLatestStates as unknown as ReturnType<typeof spyOn>).mockResolvedValue(
      new Map([["lamp", ON], ["off", ON]]),
    );
    const named = await runTool(tools, "controlar_varios_dispositivos", {
      dispositivos: ["sala", "varanda", "garagem"], power: true,
    });
    expect(named.sucesso).toEqual(["Luz da Sala"]);
    expect(named.falhas).toEqual([
      "Varanda: offline",
      expect.stringContaining('Nenhum dispositivo chamado "garagem"'),
    ]);
    expect(ctx.actions[1]?.summary).toBe("Ligou 1 dispositivos");
  });

  test("controlar_varios_dispositivos stringifies non-Error failures", async () => {
    (DeviceService.command as unknown as ReturnType<typeof spyOn>).mockRejectedValue("raw");
    const result = await runTool(tuyaTools(makeContext()), "controlar_varios_dispositivos", {
      dispositivos: ["sala"], power: true,
    });
    expect(result.falhas).toEqual(["Luz da Sala: raw"]);
  });

  test("listar_cenas and aplicar_cena", async () => {
    spy(PresetService, "list").mockResolvedValue([preset]);
    const apply = spy(PresetService, "apply").mockResolvedValue(ON);
    const ctx = makeContext();
    const tools = tuyaTools(ctx);
    expect(await runTool(tools, "listar_cenas")).toEqual({
      cenas: [{ nome: "Leitura", ligado: true, brilho: 70, cor: null }],
    });
    expect(await runTool(tools, "aplicar_cena", { cena: "leitura", dispositivo: "sala" })).toMatchObject({
      cena: "Leitura", dispositivo: "Luz da Sala",
    });
    expect(apply).toHaveBeenCalledWith("p1", "lamp");
    expect(ctx.actions.map((a) => a.summary)).toEqual(["Consultou 1 cenas", "Aplicou Leitura em Luz da Sala"]);

    expect(await runTool(tools, "aplicar_cena", { cena: "festa", dispositivo: "sala" })).toHaveProperty("error");
    expect(await runTool(tools, "aplicar_cena", { cena: "leitura", dispositivo: "garagem" })).toHaveProperty("error");
    writable.delete("p1");
    expect(await runTool(tools, "aplicar_cena", { cena: "leitura", dispositivo: "sala" })).toEqual(NO_PERMISSION);
    writable.add("p1");
    writable.delete("lamp");
    expect(await runTool(tools, "aplicar_cena", { cena: "leitura", dispositivo: "sala" })).toEqual(NO_PERMISSION);
  });

  test("ler_sensores returns visible readable sensors with readings", async () => {
    const sensorBase = {
      tuyaDeviceId: "x", category: null, online: true, enabled: true, hidden: false,
      lastEventAt: null, lastSeenAt: null, createdAt: new Date(),
    };
    const sensors = [
      { ...sensorBase, id: "s1", name: "Termômetro", kind: "temperature_humidity" },
      { ...sensorBase, id: "s2", name: "Outro", kind: "door" },
      { ...sensorBase, id: "s1h", name: "Oculto", kind: "door", hidden: true },
    ] as Sensor[];
    spy(SensorService, "list").mockResolvedValue(sensors);
    spy(SensorService, "getLatestReadingsFor").mockResolvedValue(new Map([["s1", { va_temperature: "231" }]]));
    const ctx = makeContext();
    expect(await runTool(tuyaTools(ctx), "ler_sensores")).toEqual({
      sensores: [{ nome: "Termômetro", tipo: "temperature_humidity", online: true, leituras: { va_temperature: "231" } }],
    });
    expect(ctx.actions[0]?.summary).toBe("Leu 1 sensores");
  });
});
