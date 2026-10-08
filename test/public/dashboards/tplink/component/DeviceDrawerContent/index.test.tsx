import "@public/components/GlobalDrawerContext"; // load order: avoids dashboard <-> drawer import cycle

import { DeviceDrawerContent } from "@public/dashboards/tplink/component/DeviceDrawerContent/index";

import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, mock, test } from "bun:test";

import { fail, useApi } from "../../../../../helpers/dash-api";
import { renderWithProviders } from "../../../../../helpers/public-render";

const iface = (id: string) => ({
  id, name: `if-${id}`, mac: "aa:bb", ip: "1.2.3.4", deviceId: "d", reservedIp: false, allowList: true,
});
const dev = (over: object = {}) => ({
  id: "d", name: "Dev", brand: "Brand", type: "client" as const, isController: false, interfaces: [iface("i1")], ...over,
});

let history: unknown = [];
let putFail = false;
let delFail = false;
let postFail = false;
const calls = useApi({
  "GET /api/tplink/devices/:id/history": () => history,
  "PUT /api/tplink/devices/:id/interface/:iid": () => (putFail ? fail() : {}),
  "DELETE /api/tplink/devices/:id/interface/:iid": () => (delFail ? fail() : {}),
  "POST /api/tplink/devices/:id/interface": () => (postFail ? fail() : {}),
});
afterEach(() => {
  cleanup();
  history = [];
  putFail = delFail = postFail = false;
});

const field = (label: string) =>
  screen.getByText(label, { selector: "label" }).parentElement!.querySelector("input") as HTMLInputElement;

describe("DeviceDrawerContent", () => {
  test("client device: toggles, removal, add interface", async () => {
    const onChanged = mock(() => {});
    history = [
      { checkId: "1", createdAt: 2000, online: true },
      { checkId: "2", createdAt: 1000, online: false },
    ];
    renderWithProviders(<DeviceDrawerContent device={dev()} onChanged={onChanged} />);
    expect(screen.getByText("Carregando histórico...")).toBeTruthy();
    await screen.findByText("50% online no período");
    expect(screen.getByText("Cliente")).toBeTruthy();

    fireEvent.click(screen.getByRole("switch", { name: "IP fixo" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({ reservedIp: true });
    fireEvent.click(screen.getByRole("switch", { name: "Permitido" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "PUT").at(-1)!.body).toEqual({ allowList: false }));
    putFail = true;
    fireEvent.click(screen.getByRole("switch", { name: "IP fixo" }));
    await screen.findByText("Falha ao atualizar interface");

    const trash = screen.getByText("if-i1").parentElement!.querySelector("button")!;
    fireEvent.click(trash);
    fireEvent.click(await screen.findByText("Cancelar"));
    await act(async () => {});
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    delFail = true;
    fireEvent.click(trash);
    fireEvent.click(await screen.findByText("Confirmar"));
    await screen.findByText("Falha ao remover interface");
    delFail = false;
    const before = onChanged.mock.calls.length;
    fireEvent.click(trash);
    fireEvent.click(await screen.findByText("Confirmar"));
    await waitFor(() => expect(onChanged.mock.calls.length).toBe(before + 1));

    // new interface form
    fireEvent.click(screen.getByRole("button", { name: /Adicionar interface/ }));
    await screen.findByText("Preencha nome, MAC e IP");
    fireEvent.change(field("Nome"), { target: { value: "n" } });
    fireEvent.change(field("MAC"), { target: { value: "m" } });
    fireEvent.change(field("IP"), { target: { value: "i" } });
    postFail = true;
    fireEvent.click(screen.getByRole("button", { name: /Adicionar interface/ }));
    await screen.findByText("Falha ao criar interface");
    postFail = false;
    const b2 = onChanged.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Adicionar interface/ }));
    await waitFor(() => expect(onChanged.mock.calls.length).toBe(b2 + 1));
    expect(field("Nome").value).toBe("");
  });

  test("controller router is read-only", async () => {
    renderWithProviders(
      <DeviceDrawerContent device={dev({ type: "router", isController: true })} onChanged={() => {}} />,
    );
    await screen.findByText("Sem histórico de conexão no período.");
    expect(screen.getByText("Controller")).toBeTruthy();
    expect(screen.getByText("Roteador")).toBeTruthy();
    expect(screen.getByText("Interface do controller não pode ser editada.")).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText("Adicionar interface")).toBeNull();
  });

  test("router without interfaces offers the form; null history becomes empty", async () => {
    history = null;
    renderWithProviders(<DeviceDrawerContent device={dev({ type: "router", interfaces: [] })} onChanged={() => {}} />);
    await screen.findByText("Sem histórico de conexão no período.");
    expect(screen.getByText("Nenhuma interface cadastrada.")).toBeTruthy();
    expect(within(document.body).getByText("Adicionar interface")).toBeTruthy();
  });
});
