import "@public/components/GlobalDrawerContext"; // load order: avoids dashboard <-> drawer import cycle

import { UnregisteredDevices } from "@public/dashboards/tplink/component/UnregisteredDevices/index";

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, mock, test } from "bun:test";

import { fail, useApi } from "../../../../../helpers/dash-api";
import { renderWithProviders } from "../../../../../helpers/public-render";

const online = [
  { mac: "AA:AA", ip: "1.1.1.1", vendor: "Unknown", name: "Unknown", routerInterface: "" },
  { mac: "bb:bb", ip: "", vendor: "Acme", name: "Phone", routerInterface: "5G" },
  { mac: "cc:cc", ip: "3.3.3.3", vendor: "X", name: "Registered", routerInterface: "2G" },
];
const devices = [{ id: "d1", name: "Dev1", brand: "B", interfaces: [{ mac: "CC:CC" }] }];

let devFail = false;
let ifaceFail = false;
const calls = useApi({
  "POST /api/tplink/devices": () => (devFail ? fail() : { id: "new" }),
  "POST /api/tplink/devices/:id/interface": () => (ifaceFail ? fail() : {}),
});
afterEach(() => {
  cleanup();
  devFail = ifaceFail = false;
});

const modal = (title: string) => screen.getByRole("heading", { name: title }).parentElement as HTMLElement;
const input = (root: HTMLElement, label: string) =>
  within(root).getByText(label).parentElement!.querySelector("input,select") as HTMLInputElement;
const set = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const row = (name: string) => screen.getByText(name).closest("tr")!;

describe("UnregisteredDevices", () => {
  test("renders nothing when everything is registered", () => {
    renderWithProviders(
      <UnregisteredDevices onlineDevices={[online[2]!]} devices={devices} onChanged={() => {}} />,
    );
    expect(screen.queryByText(/não registrados/)).toBeNull();
  });

  test("lists only unregistered devices with fallbacks", () => {
    renderWithProviders(<UnregisteredDevices onlineDevices={online} devices={devices} onChanged={() => {}} />);
    expect(screen.getByText("Dispositivos não registrados (2)")).toBeTruthy();
    expect(within(row("Phone")).getAllByText("-").length).toBe(1);
    expect(within(row("AA:AA")).getAllByText("-").length).toBe(1);
  });

  test("link flow: validation, failure, success", async () => {
    const onChanged = mock(() => {});
    renderWithProviders(<UnregisteredDevices onlineDevices={online} devices={devices} onChanged={onChanged} />);
    fireEvent.click(within(row("Phone")).getByRole("button", { name: /Vincular/ }));
    const m = modal("Vincular a dispositivo existente");
    fireEvent.click(within(m).getByRole("button", { name: "Vincular" }));
    await screen.findByText("Selecione o dispositivo e informe nome da interface e IP");
    set(input(m, "Dispositivo"), "d1");
    set(input(m, "Nome da interface"), "eth0");
    set(input(m, "IP"), "9.9.9.9");
    ifaceFail = true;
    fireEvent.click(within(m).getByRole("button", { name: "Vincular" }));
    await screen.findByText("Falha ao vincular interface");
    ifaceFail = false;
    fireEvent.click(within(m).getByRole("button", { name: "Vincular" }));
    await screen.findByText("Interface vinculada");
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(calls.at(-1)!.body).toEqual({ name: "eth0", mac: "bb:bb", ip: "9.9.9.9" });
    fireEvent.click(within(m).getByRole("button", { name: "Cancelar" }));
    fireEvent.click(m.parentElement!); // overlay click -> Modal onClose
  });

  test("create flow: prefill, validation, failures, success", async () => {
    const onChanged = mock(() => {});
    renderWithProviders(<UnregisteredDevices onlineDevices={online} devices={devices} onChanged={onChanged} />);
    // "Unknown" name/vendor are not prefilled
    fireEvent.click(within(row("AA:AA")).getByRole("button", { name: /Criar/ }));
    const m = modal("Criar novo dispositivo");
    expect(input(m, "Nome").value).toBe("");
    expect(input(m, "IP").value).toBe("1.1.1.1");
    fireEvent.click(within(m).getByRole("button", { name: "Criar" }));
    await screen.findByText("Preencha nome, marca, nome da interface e IP");

    fireEvent.click(within(row("Phone")).getByRole("button", { name: /Criar/ }));
    expect(input(m, "Nome").value).toBe("Phone");
    expect(input(m, "Marca").value).toBe("Acme");
    set(input(m, "Nome"), "Phone 2");
    set(input(m, "Marca"), "Acme 2");
    set(input(m, "Nome da interface"), "wifi");
    set(input(m, "IP"), "5.5.5.5");

    devFail = true;
    fireEvent.click(within(m).getByRole("button", { name: "Criar" }));
    await screen.findByText("Falha ao criar dispositivo");
    devFail = false;
    ifaceFail = true;
    fireEvent.click(within(m).getByRole("button", { name: "Criar" }));
    await screen.findByText("Dispositivo criado, mas falhou ao adicionar a interface");
    ifaceFail = false;
    fireEvent.click(within(m).getByRole("button", { name: "Criar" }));
    await screen.findByText("Dispositivo criado e vinculado");
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    fireEvent.click(within(m).getByRole("button", { name: "Cancelar" }));
    fireEvent.click(m.parentElement!); // overlay click -> Modal onClose
  });
});
