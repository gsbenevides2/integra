import React from "react";

import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, expect, spyOn, test } from "bun:test";

import { fail, mockTuyaFetch } from "../../../helpers/tuya-fetch";
import { btn, device, preset, sensor } from "../../../helpers/tuya-fixtures";
import { mockRecharts, restoreRecharts } from "../../../helpers/tuya-recharts";
import { renderTuya } from "../../../helpers/tuya-render";

mockRecharts();
const { TuyaDashboard, tuyaDashboard } = await import("@public/dashboards/tuya/index");
afterAll(restoreRecharts);

let m: ReturnType<typeof mockTuyaFetch>;
let timers: Array<() => void> = [];
const intervalSpy = spyOn(globalThis, "setInterval").mockImplementation(((cb: () => void) => {
  timers.push(cb);
  return timers.length as any;
}) as any);
afterAll(() => intervalSpy.mockRestore());
afterEach(() => {
  cleanup();
  m?.restore();
  timers = [];
});

interface Data {
  devices?: unknown;
  sensors?: unknown;
  presets?: unknown;
  cameras?: unknown;
}
const full: Data = {
  devices: [
    device({ id: "d1", name: "Sala" }),
    device({ id: "d2", name: "Escura", hidden: true }),
    device({ id: "d3", name: "Switch", kind: "switch", state: { channels: { "1": false } } }),
  ],
  sensors: [sensor({ id: "s1", name: "Porta" }), sensor({ id: "s2", name: "Escondido", hidden: true })],
  presets: [preset({ id: "p1" })],
  cameras: ["garagem"],
};

function boot(data: Data = full, extra: Record<string, any> = {}) {
  m = mockTuyaFetch({
    "GET /api/tuya/devices": () => data.devices ?? [],
    "GET /api/tuya/sensors": () => data.sensors ?? [],
    "GET /api/tuya/presets": () => data.presets ?? [],
    "GET /api/frigate/cameras": () => data.cameras ?? [],
    "GET /api/tuya/devices/d1/history": () => ({ snapshots: [] }),
    "GET /api/tuya/sensors/s1/history": () => ({ readings: [] }),
    ...extra,
  });
  return renderTuya(<TuyaDashboard />);
}
const confirmBtn = (t: string) => screen.getAllByText(t).find((e) => e.closest(".max-w-sm"))!;
const nm = (t: string) => screen.getByText(t, { selector: "span.truncate" });
const closeDrawer = (i: number) => fireEvent.click(screen.getAllByLabelText("Fechar")[i]!);

test("exports the dashboard descriptor", () => {
  expect(tuyaDashboard.id).toBe("tuya");
  expect(tuyaDashboard.content).toBe(TuyaDashboard);
});

test("loads and renders every section; hidden toggles", async () => {
  boot();
  expect(screen.getByText("Carregando...")).toBeTruthy();
  await screen.findByText("Iluminação (1)");
  expect(screen.getByText("Câmeras (1)")).toBeTruthy();
  expect(screen.getByText("Modos (1)")).toBeTruthy();
  expect(screen.getByText("Sensores (1)")).toBeTruthy();
  expect(screen.getByText("Interruptores (1)")).toBeTruthy();
  expect(screen.queryByText("Escura")).toBeNull();
  expect(m.calls[0]!.query.get("includeHidden")).toBe("true");

  fireEvent.click(screen.getByText("Mostrar ocultas (1)"));
  expect(screen.getByText("Escura")).toBeTruthy();
  fireEvent.click(screen.getByText("Esconder ocultas"));
  expect(screen.queryByText("Escura")).toBeNull();

  fireEvent.click(screen.getByText("Mostrar ocultos (1)"));
  expect(screen.getByText("Escondido")).toBeTruthy();
  fireEvent.click(screen.getByText("Esconder ocultos"));
  expect(screen.queryByText("Escondido")).toBeNull();

  fireEvent.click(screen.getByLabelText("Abrir menu"));
});

test("empty states", async () => {
  boot({});
  await screen.findByText(/Nenhuma lâmpada ainda/);
  expect(screen.getByText(/Nenhum modo ainda/)).toBeTruthy();
  expect(screen.getByText(/Nenhum sensor ainda/)).toBeTruthy();
  expect(screen.getByText(/Nenhum interruptor ainda/)).toBeTruthy();
  expect(screen.queryByText(/Câmeras/)).toBeNull();
});

test("everything hidden", async () => {
  boot({
    devices: [device({ hidden: true })],
    sensors: [sensor({ hidden: true })],
  });
  await screen.findByText("Todas as lâmpadas estão ocultas.");
  expect(screen.getByText("Todos os sensores estão ocultos.")).toBeTruthy();
});

test("failed loads leave state empty", async () => {
  boot(full, {
    "GET /api/tuya/devices": fail,
    "GET /api/tuya/sensors": fail,
    "GET /api/tuya/presets": fail,
    "GET /api/frigate/cameras": fail,
  });
  await screen.findByText(/Nenhuma lâmpada ainda/);
  expect(screen.queryByText(/Câmeras/)).toBeNull();
});

test("command: optimistic, applied from server, and poll does not clobber in-flight", async () => {
  let release!: (v: unknown) => void;
  const gate = new Promise((r) => (release = r));
  boot(full, {
    "POST /api/tuya/devices/d1/command": async () => {
      await gate;
      return { power: false, online: true };
    },
  });
  await screen.findByText("Iluminação (1)");
  const sala = nm("Sala").closest("div.rounded-md")!;
  expect(sala.textContent).toContain("Ligada");
  fireEvent.click(sala.querySelector('[role="switch"]')!);
  await waitFor(() => expect(sala.textContent).toContain("Desligada"));
  // a poll lands mid-flight with the stale reading (power on)
  await act(async () => {
    timers.forEach((t) => t());
    await new Promise((r) => setTimeout(r, 10));
  });
  expect(sala.textContent).toContain("Desligada");
  release(null);
  await waitFor(() => expect(m.calls.at(-1)!.method).toBeDefined());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  expect(sala.textContent).toContain("Desligada");
  expect(m.calls.find((c) => c.method === "POST")!.body).toEqual({ power: false });
});

test("failed command reverts and toasts", async () => {
  boot(full, { "POST /api/tuya/devices/d3/command": fail });
  await screen.findByText("Interruptores (1)");
  const sw = nm("Switch").closest("div.rounded-md")!;
  fireEvent.click(sw.querySelector('[role="switch"]')!);
  await screen.findByText('Falha ao comandar "Switch"');
  expect(sw.textContent).toContain("Desligado");
});

test("preset quick apply sends the preset fields to the first online lamp", async () => {
  boot(
    {
      ...full,
      devices: [device({ id: "d0", name: "Off", state: { online: false } }), device({ id: "d1", name: "Sala" })],
      presets: [preset({ brightness: null, colorTemp: null, colorHex: null, workMode: null })],
    },
    { "POST /api/tuya/devices/d1/command": () => ({ power: true }) },
  );
  fireEvent.click(await screen.findByText(/Aplicar na/));
  await waitFor(() => expect(m.calls.some((c) => c.method === "POST")).toBe(true));
  expect(m.calls.find((c) => c.method === "POST")!.body).toEqual({ power: true });
});

test("quick apply falls back to the first visible lamp when none is online; none -> no quick apply", async () => {
  boot({ ...full, devices: [device({ state: { online: false } })] });
  await screen.findByText(/Aplicar na/);
  cleanup();
  m.restore();
  boot({ ...full, devices: [] });
  await screen.findByText("Modos (1)");
  expect(screen.queryByText(/Aplicar na/)).toBeNull();
  expect(screen.queryByText("Aplicar em outra")).toBeNull();
});

test("apply preset modal opens and closes", async () => {
  boot();
  fireEvent.click(await screen.findByText("Aplicar em outra"));
  expect(screen.getByText('Aplicar "Leitura"')).toBeTruthy();
  const title = screen.getByText('Aplicar "Leitura"');
  fireEvent.click(within(title.parentElement!).getByText("Cancelar"));
  expect(screen.getByText('Aplicar ""')).toBeTruthy();
});

test("device drawer: open, close, delete", async () => {
  boot(full, { "DELETE /api/tuya/devices/d1": () => ({ ok: 1 }) });
  await screen.findByText("Iluminação (1)");
  fireEvent.click(nm("Sala"));
  await screen.findByText("Configuração");
  closeDrawer(0);
  await waitFor(() => expect(screen.queryByText("Remover")).toBeNull());
  fireEvent.click(nm("Sala"));
  await screen.findByText("Remover");
  fireEvent.click(screen.getByText("Remover"));
  fireEvent.click(confirmBtn("Confirmar"));
  await screen.findByText("Dispositivo removido");
  await waitFor(() => expect(m.calls.filter((c) => c.path === "/api/tuya/devices" && c.method === "GET").length).toBeGreaterThan(1));
});

test("device drawer onChanged refetches", async () => {
  boot(full, { "PUT /api/tuya/devices/d1": () => ({ ok: 1 }) });
  await screen.findByText("Iluminação (1)");
  fireEvent.click(nm("Sala"));
  await screen.findByText("Configuração");
  const before = m.calls.length;
  fireEvent.click(screen.getAllByText("Salvar")[0]!);
  await screen.findByText("Dispositivo salvo");
  await waitFor(() => expect(m.calls.length).toBeGreaterThan(before + 1));
});

test("sensor drawer: open, change, close", async () => {
  boot(full, { "PUT /api/tuya/sensors/s1": () => ({ ok: 1 }) });
  await screen.findByText("Iluminação (1)");
  fireEvent.click(nm("Porta"));
  await screen.findByText("Configuração");
  fireEvent.click(screen.getAllByText("Salvar")[0]!);
  await screen.findByText("Sensor salvo");
  closeDrawer(1);
});

test("preset drawer: open, change, delete, close", async () => {
  boot(full, {
    "PUT /api/tuya/presets/p1": () => ({ ok: 1 }),
    "DELETE /api/tuya/presets/p1": () => ({ ok: 1 }),
  });
  await screen.findByText("Modos (1)");
  fireEvent.click(nm("Leitura"));
  await screen.findAllByText("Liga a lâmpada ao aplicar");
  fireEvent.click(screen.getAllByText("Salvar")[0]!);
  await screen.findByText("Modo salvo");
  fireEvent.click(screen.getByText("Remover"));
  fireEvent.click(confirmBtn("Confirmar"));
  await screen.findByText("Modo removido");
  fireEvent.click(nm("Leitura"));
  closeDrawer(2);
});

test("new device / sensor / preset forms create and refetch", async () => {
  boot(full, {
    "POST /api/tuya/devices": () => ({ id: "n" }),
    "POST /api/tuya/sensors": () => ({ id: "n" }),
    "POST /api/tuya/presets": () => ({ id: "n" }),
  });
  await screen.findByText("Iluminação (1)");
  const type = (label: string, value: string, i = 0) =>
    fireEvent.change(screen.getAllByText(label)[i]!.parentElement!.querySelector("input")!, { target: { value } });

  fireEvent.click(screen.getByText("Novo dispositivo", { selector: "button" }));
  type("Nome", "L");
  type("Device ID (Tuya)", "x");
  fireEvent.click(btn("Cadastrar"));
  await screen.findByText("Dispositivo cadastrado");

  fireEvent.click(screen.getByText("Novo sensor", { selector: "button" }));
  type("Nome", "S", 1);
  type("Device ID (Tuya)", "y", 1);
  fireEvent.click(screen.getAllByText("Cadastrar")[1]!);
  await screen.findByText("Sensor cadastrado");

  fireEvent.click(screen.getByText("Novo modo", { selector: "button" }));
  type("Nome", "M", 2);
  fireEvent.click(screen.getAllByText("Cadastrar")[2]!);
  await screen.findByText("Modo cadastrado");
  await waitFor(() => expect(m.calls.filter((c) => c.path === "/api/tuya/presets" && c.method === "GET").length).toBeGreaterThan(3));
});

test("switch card opens its drawer", async () => {
  boot(full, {
    "GET /api/tuya/devices/d3/history": () => ({ snapshots: [] }),
    "POST /api/tuya/devices/d3/command": () => ({ channels: { "1": true } }),
  });
  await screen.findByText("Interruptores (1)");
  fireEvent.click(nm("Switch"));
  await screen.findByText("Configuração");
  // the drawer's own channel switch sits after the cards' switches
  // busy state disables the rest once one is clicked, so go from the last one
  for (const sw of screen.getAllByRole("switch").reverse()) fireEvent.click(sw);
  await waitFor(() => expect(m.calls.some((c) => c.method === "POST")).toBe(true));
});
