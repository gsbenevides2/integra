import React from "react";

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, expect, mock, test } from "bun:test";

import { fail, mockTuyaFetch } from "../../../../../helpers/tuya-fetch";
import { btn, device, field } from "../../../../../helpers/tuya-fixtures";
import { mockRecharts, restoreRecharts } from "../../../../../helpers/tuya-recharts";
import { renderTuya } from "../../../../../helpers/tuya-render";

mockRecharts();
const { DeviceDrawerContent } = await import("@public/dashboards/tuya/component/DeviceDrawerContent/index");
afterAll(restoreRecharts);

let m: ReturnType<typeof mockTuyaFetch>;
afterEach(() => {
  cleanup();
  m?.restore();
});

const snap = { id: "1", online: true, power: true, brightness: 50, colorTemp: null, colorHex: null, workMode: null, recordedAt: "2024-01-01T00:00:00Z" };
const confirmBtn = (t: string) => screen.getAllByText(t).find((e) => e.closest(".max-w-sm"))!;

function setup(over: Parameters<typeof device>[0] = {}, routes: Record<string, any> = {}) {
  m = mockTuyaFetch({ "GET /api/tuya/devices/d1/history": () => ({ snapshots: [snap] }), ...routes });
  const p = { onCommand: mock(() => {}), onChanged: mock(() => {}), onDeleted: mock(() => {}) };
  renderTuya(<DeviceDrawerContent device={device(over)} isBusy={false} {...p} />);
  return p;
}

test("lamp: history chart, mode summary, details", async () => {
  setup({ state: { workMode: "colour", colorHex: "#ff0000" } });
  await screen.findByText("Histórico");
  expect(screen.getByText("#ff0000 · 100%")).toBeTruthy();
  expect(screen.getByText("Lâmpada")).toBeTruthy();
  expect(screen.getByText("Visível no painel")).toBeTruthy();
});

test("white lamp with no brightness; history without snapshots; hidden", async () => {
  setup({ hidden: true, state: { brightness: null } }, { "GET /api/tuya/devices/d1/history": () => ({}) });
  expect(screen.getByText("Branco")).toBeTruthy();
  expect(screen.getByText("Oculta no painel")).toBeTruthy();
  await waitFor(() => expect(m.calls.length).toBe(1));
  expect(screen.queryByText("Histórico")).toBeNull();
});

test("history failure keeps chart hidden", async () => {
  setup({}, { "GET /api/tuya/devices/d1/history": fail });
  await waitFor(() => expect(m.calls.length).toBe(1));
  await new Promise((r) => setTimeout(r, 5));
  expect(screen.queryByText("Histórico")).toBeNull();
});

test("switch device shows switch controls and no mode section", async () => {
  setup({ kind: "switch", state: { channels: { "1": true } } });
  expect(screen.getByText("Interruptor")).toBeTruthy();
  expect(screen.queryByText("Salvar como modo")).toBeNull();
});

test("offline lamp has no mode section", () => {
  setup({ state: { online: false } });
  expect(screen.queryByText("Salvar como modo")).toBeNull();
});

test("save name success and failure", async () => {
  const p = setup({}, { "PUT /api/tuya/devices/d1": () => ({ ok: 1 }) });
  fireEvent.change(field("Nome"), { target: { value: "Novo" } });
  fireEvent.click(screen.getAllByText("Salvar")[0]!);
  await screen.findByText("Dispositivo salvo");
  expect(m.calls.at(-1)!.body).toEqual({ name: "Novo" });
  expect(p.onChanged).toHaveBeenCalled();
  m.restore();
  m = mockTuyaFetch({ "PUT /api/tuya/devices/d1": fail });
  fireEvent.click(screen.getAllByText("Salvar")[0]!);
  await screen.findByText("Falha ao salvar o dispositivo");
});

test("toggle hidden success and failure", async () => {
  const p = setup({}, { "PUT /api/tuya/devices/d1": () => ({ ok: 1 }) });
  fireEvent.click(screen.getAllByRole("switch").at(-1)!);
  await waitFor(() => expect(p.onChanged).toHaveBeenCalled());
  expect(m.calls.at(-1)!.body).toEqual({ hidden: true });
  m.restore();
  m = mockTuyaFetch({ "PUT /api/tuya/devices/d1": fail });
  fireEvent.click(screen.getAllByRole("switch").at(-1)!);
  await screen.findByText("Falha ao alterar a visibilidade");
});

test("save as mode: success, validation and failure", async () => {
  const p = setup({ state: { power: null, workMode: "colour", colorHex: "#ff0000" } }, { "POST /api/tuya/presets": () => ({ id: "p" }) });
  fireEvent.click(screen.getByText("Salvar como modo"));
  const input = screen.getByText("Nome do modo").parentElement!.querySelector("input")!;
  expect(input.value).toStartWith("Sala - ");
  fireEvent.change(input, { target: { value: "" } });
  expect((screen.getAllByText("Salvar").at(-1) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(input, { target: { value: "Filme" } });
  fireEvent.click(screen.getAllByText("Salvar").at(-1)!);
  await screen.findByText('Modo "Filme" salvo');
  expect(m.calls.at(-1)!.body).toMatchObject({ name: "Filme", power: true, workMode: "colour", colorHex: "#ff0000" });
  expect(p.onChanged).toHaveBeenCalled();

  m.restore();
  m = mockTuyaFetch({ "POST /api/tuya/presets": fail });
  fireEvent.click(screen.getByText("Salvar como modo"));
  fireEvent.click(screen.getAllByText("Salvar").at(-1)!);
  await screen.findByText("Falha ao salvar o modo");
  expect(m.calls.at(-1)!.body.workMode).toBe("colour");
  fireEvent.click(btn("Cancelar"));
  fireEvent.click(screen.getByText("Salvar como modo"));
  fireEvent.click(screen.getByText(/Salvar estado de/).parentElement!.parentElement!);
});

test("remove: declined, failure, success; white mode preset", async () => {
  const p = setup({}, { "DELETE /api/tuya/devices/d1": fail });
  fireEvent.click(screen.getByText("Remover"));
  await screen.findByText(/Remover "Sala"\?/);
  fireEvent.click(confirmBtn("Cancelar"));
  await new Promise((r) => setTimeout(r, 0));
  expect(m.calls.some((c) => c.method === "DELETE")).toBe(false);

  fireEvent.click(screen.getByText("Remover"));
  fireEvent.click(confirmBtn("Confirmar"));
  await screen.findByText("Falha ao remover o dispositivo");

  m.restore();
  m = mockTuyaFetch({ "DELETE /api/tuya/devices/d1": () => ({ ok: 1 }) });
  fireEvent.click(screen.getByText("Remover"));
  fireEvent.click(confirmBtn("Confirmar"));
  await screen.findByText("Dispositivo removido");
  expect(p.onDeleted).toHaveBeenCalled();
});

test("white lamp saves mode as white", async () => {
  setup({}, { "POST /api/tuya/presets": () => ({ id: "p" }) });
  fireEvent.click(screen.getByText("Salvar como modo"));
  fireEvent.click(screen.getAllByText("Salvar").at(-1)!);
  await waitFor(() => expect(m.calls.at(-1)!.method).toBe("POST"));
  expect(m.calls.at(-1)!.body.workMode).toBe("white");
});

test("unmount before history resolves", async () => {
  setup();
  cleanup();
  await new Promise((r) => setTimeout(r, 5));
});
