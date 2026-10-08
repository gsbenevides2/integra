import "@public/components/GlobalDrawerContext"; // load order: avoids dashboard <-> drawer import cycle

import React from "react";

import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";

import { fail, fakeRecharts, useApi } from "../../../helpers/dash-api";
import { renderWithProviders } from "../../../helpers/public-render";

const realRecharts = { ...(await import("recharts")) };
mock.module("recharts", () => fakeRecharts(React));
afterAll(() => mock.module("recharts", () => realRecharts));

const { tplinkDashboard } = await import("@public/dashboards/tplink/index");
const Dashboard = tplinkDashboard.content;

const iface = (id: string, mac: string, deviceId: string) => ({
  id, name: `if-${id}`, mac, ip: "192.168.0.2", deviceId, reservedIp: false, allowList: false,
});
const devices = () => [
  { id: "c1", name: "Client1", brand: "BrandA", type: "client", isController: false, interfaces: [iface("i1", "aa:bb:cc:00:00:01", "c1")] },
  { id: "c2", name: "Client2", brand: "BrandB", type: "client", isController: false, interfaces: [] },
  { id: "r1", name: "RouterCtl", brand: "TP", type: "router", isController: true, interfaces: [iface("i2", "aa:bb:cc:00:00:99", "r1")] },
  { id: "r2", name: "RouterAgent", brand: "TP", type: "router", isController: false, interfaces: [iface("i3", "aa:bb:cc:00:00:98", "r2")] },
];
const status = {
  wanIp: "1.1.1.1", connectionStatus: "Connected", connectionUptime: "1d", routerUptime: "2d",
  firmwareVersion: "1.0", hardwareVersion: "v1", cpuUsage: 10, memoryUsage: 20, totalDownload: "1GB", totalUpload: "2GB",
};
const online = {
  devices: [
    { mac: "AA:BB:CC:00:00:01", ip: "192.168.0.2", vendor: "A", name: "Client1", routerInterface: "5G" },
    { mac: "11:22:33:44:55:66", ip: "192.168.0.50", vendor: "Acme", name: "Phone", routerInterface: "2.4G" },
  ],
};
const snaps = {
  snapshots: [
    { id: "1", cpuUsage: 1, memoryUsage: 2, connectionStatus: "Connected", collectedAt: "2024-01-01T10:00:00Z" },
    { id: "2", cpuUsage: null, memoryUsage: null, connectionStatus: "Down", collectedAt: "2024-01-01T11:00:00Z" },
  ],
};

let R: Record<string, unknown>;
const reset = () => {
  R = { devices: devices(), status, online, snaps, sync: {}, restart: {}, del: {}, create: { id: "new" }, history: [] };
};
reset();
const calls = useApi({
  "GET /api/tplink/devices": () => R.devices,
  "GET /api/tplink/settings/latest-router-status": () => R.status,
  "GET /api/tplink/checks/latest": () => R.online,
  "GET /api/tplink/settings/router-status-history": () => R.snaps,
  "POST /api/tplink/router/sync": () => R.sync,
  "POST /api/tplink/router/restart-network": () => R.restart,
  "DELETE /api/tplink/devices/:id": () => R.del,
  "POST /api/tplink/devices": () => R.create,
  "POST /api/tplink/devices/:id/interface": () => ({}),
  "PUT /api/tplink/devices/:id/interface/:iid": () => ({}),
  "GET /api/tplink/devices/:id/history": () => R.history,
});
afterEach(() => {
  cleanup();
  reset();
});

const modal = (title: string) => screen.getByRole("heading", { name: title }).parentElement as HTMLElement;
const input = (root: HTMLElement, label: string) =>
  within(root).getByText(label).parentElement!.querySelector("input,select") as HTMLInputElement;
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const btn = (root: HTMLElement | typeof screen, name: string | RegExp) =>
  (root as typeof screen).getByRole("button", { name }) as HTMLButtonElement;
const cancelConfirm = async (message: RegExp) => {
  const dialog = (await screen.findByText(message)).closest(".fixed") as HTMLElement;
  fireEvent.click(within(dialog).getByText("Cancelar"));
};
const loaded = () => screen.findByText("Dispositivos registrados (4)");
const rowBtn = (name: string) => screen.getByText(name).closest("tr")!.querySelector("button")!;

describe("TplinkDashboard", () => {
  test("renders table sorted with online status, panel and chart", async () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText("Carregando...")).toBeTruthy();
    await loaded();
    fireEvent.click(screen.getByLabelText("Abrir menu"));
    const names = Array.from(document.querySelectorAll("tbody tr td:first-child")).map((t) => t.textContent);
    expect(names.slice(0, 4)).toEqual(["RouterCtl", "RouterAgent", "Client1", "Client2"]);
    expect(screen.getByText("Roteador (Controller)")).toBeTruthy();
    expect(screen.getByText("Roteador (Agente)")).toBeTruthy();
    expect(screen.getAllByText("Conectado").length).toBe(1);
    expect(screen.getAllByText("Desconectado").length).toBe(3);
    expect(screen.getByText("1.1.1.1")).toBeTruthy();
    expect(screen.getByText("CPU, memória e conexão do roteador")).toBeTruthy();
    expect(screen.getByText("Dispositivos não registrados (1)")).toBeTruthy();
  });

  test("handles missing data and empty devices", async () => {
    R.devices = null; R.status = null; R.online = {}; R.snaps = {};
    renderWithProviders(<Dashboard />);
    await screen.findByText("Nenhum dispositivo cadastrado.");
    expect(screen.getByText("Nenhum status do roteador ainda.")).toBeTruthy();
    expect(screen.queryByText("CPU, memória e conexão do roteador")).toBeNull();
  });

  test("handles online/snapshot payloads present but without lists", async () => {
    R.online = {}; R.snaps = {};
    R.devices = []; R.status = null;
    const { unmount } = renderWithProviders(<Dashboard />);
    await screen.findByText("Nenhum dispositivo cadastrado.");
    unmount();
    R.online = null; R.snaps = null;
    renderWithProviders(<Dashboard />);
    await screen.findByText("Nenhum dispositivo cadastrado.");
  });

  test("sync success and failure", async () => {
    renderWithProviders(<Dashboard />);
    await loaded();
    fireEvent.click(btn(screen, /Sincronizar/));
    await screen.findByText("Sincronização concluída");
    R.sync = fail();
    fireEvent.click(btn(screen, /Sincronizar/));
    await screen.findByText("Falha ao sincronizar com o roteador");
  });

  test("restart network: cancel, success, failure", async () => {
    renderWithProviders(<Dashboard />);
    await loaded();
    fireEvent.click(btn(screen, /Reiniciar rede/));
    await cancelConfirm(/Isso vai reiniciar/);
    await act(async () => {});
    expect(calls.some((c) => c.path.endsWith("restart-network"))).toBe(false);
    fireEvent.click(btn(screen, /Reiniciar rede/));
    fireEvent.click(await screen.findByText("Confirmar"));
    await screen.findByText("Reinício disparado");
    R.restart = fail();
    fireEvent.click(btn(screen, /Reiniciar rede/));
    fireEvent.click(await screen.findByText("Confirmar"));
    await screen.findByText("Falha ao reiniciar a rede");
  });

  test("remove device: cancel, failure, success", async () => {
    renderWithProviders(<Dashboard />);
    await loaded();
    fireEvent.click(rowBtn("Client2"));
    await cancelConfirm(/Remover o dispositivo/);
    await act(async () => {});
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    R.del = fail();
    fireEvent.click(rowBtn("Client2"));
    fireEvent.click(await screen.findByText("Confirmar"));
    await screen.findByText("Falha ao remover dispositivo");
    R.del = {};
    fireEvent.click(rowBtn("Client2"));
    fireEvent.click(await screen.findByText("Confirmar"));
    await waitFor(() => expect(calls.filter((c) => c.method === "DELETE").length).toBe(2));
  });

  test("opens and closes the device drawer", async () => {
    renderWithProviders(<Dashboard />);
    await loaded();
    fireEvent.click(screen.getByText("Client1").closest("tr")!);
    const title = await screen.findByRole("heading", { name: "Client1", level: 2 });
    const drawer = title.closest("[data-drawer-open]") as HTMLElement;
    expect(drawer).toBeTruthy();
    await within(drawer).findByText("Sem histórico de conexão no período.");
    fireEvent.click(within(drawer).getByLabelText("Fechar"));
    await waitFor(() => expect(document.querySelector("[data-drawer-open]")).toBeNull());
  });

  test("new device form: validation, client, router and failure", async () => {
    renderWithProviders(<Dashboard />);
    await loaded();
    fireEvent.click(btn(screen, /Novo dispositivo/));
    const m = modal("Novo dispositivo");
    fireEvent.click(btn(within(m) as any, "Criar"));
    await screen.findByText("Preencha nome e marca");

    type(input(m, "Nome"), "Dev");
    type(input(m, "Marca"), "Br");
    R.create = fail();
    fireEvent.click(btn(within(m) as any, "Criar"));
    await screen.findByText("Falha ao criar dispositivo");
    R.create = { id: "n" };
    fireEvent.click(btn(within(m) as any, "Criar"));
    await screen.findByText("Dispositivo criado");
    expect(calls.filter((c) => c.method === "POST" && c.path === "/api/tplink/devices").at(-1)!.body).toEqual({ name: "Dev", brand: "Br", type: "client" });

    // router with controller flag + password
    type(input(m, "Nome"), "R");
    type(input(m, "Marca"), "B");
    type(input(m, "Tipo"), "router");
    type(input(m, "Senha de admin do roteador"), "pw");
    fireEvent.click(m.querySelector("input[type=checkbox]")!);
    fireEvent.click(btn(within(m) as any, "Criar"));
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "POST" && c.path === "/api/tplink/devices").at(-1)!.body).toEqual({
        name: "R", brand: "B", type: "router", isController: true, routerPassword: "pw",
      }),
    );

    // router without password; cancel closes
    type(input(m, "Nome"), "R2");
    type(input(m, "Marca"), "B2");
    type(input(m, "Tipo"), "router");
    fireEvent.click(btn(within(m) as any, "Criar"));
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "POST" && c.path === "/api/tplink/devices").at(-1)!.body.routerPassword).toBeUndefined(),
    );
    fireEvent.click(btn(within(m) as any, "Cancelar"));
  });

  test("child components refresh the list through onChanged", async () => {
    renderWithProviders(<Dashboard />);
    await loaded();
    const count = () => calls.filter((c) => c.path === "/api/tplink/devices" && c.method === "GET").length;
    // drawer: toggle an interface flag
    fireEvent.click(screen.getByText("Client1").closest("tr")!);
    const drawer = (await screen.findByRole("heading", { name: "Client1", level: 2 })).closest("[data-drawer-open]") as HTMLElement;
    const before = count();
    fireEvent.click(within(drawer).getByRole("switch", { name: "IP fixo" }));
    await waitFor(() => expect(count()).toBe(before + 1));
    fireEvent.click(within(drawer).getByLabelText("Fechar"));
    // unregistered devices: link an interface
    fireEvent.click(screen.getAllByRole("button", { name: /Vincular/ })[0]!);
    const m = modal("Vincular a dispositivo existente");
    type(input(m, "Dispositivo"), "c2");
    type(input(m, "Nome da interface"), "eth");
    const again = count();
    fireEvent.click(within(m).getByRole("button", { name: "Vincular" }));
    await waitFor(() => expect(count()).toBe(again + 1));
  });

  test("polling refreshes data", async () => {
    let tick: (() => void) | undefined;
    const orig = globalThis.setInterval;
    globalThis.setInterval = ((fn: () => void) => ((tick ??= fn), 1)) as any;
    renderWithProviders(<Dashboard />);
    globalThis.setInterval = orig;
    await loaded();
    R.devices = devices().slice(0, 1);
    await act(async () => tick!());
    await screen.findByText("Dispositivos registrados (1)");
  });
});
