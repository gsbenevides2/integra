import React from "react";

import { DeviceCard } from "@public/dashboards/tuya/component/DeviceCard/index";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, mock, test } from "bun:test";

import { device } from "../../../../../helpers/tuya-fixtures";

afterEach(cleanup);

function r(over: Parameters<typeof device>[0], isBusy = false) {
  const onCommand = mock((_c: unknown) => {});
  const onOpen = mock(() => {});
  render(
    <DeviceCard
      device={device(over)}
      isBusy={isBusy}
      onCommand={onCommand}
      onOpen={onOpen}
    />,
  );
  return { onCommand, onOpen };
}

test("lamp on, white mode: toggle, open, brightness", () => {
  const { onCommand, onOpen } = r({ state: { power: true } });
  expect(screen.getByText("Ligada")).toBeTruthy();
  expect(screen.getByText("Online")).toBeTruthy();
  fireEvent.click(screen.getByRole("switch"));
  expect(onCommand).toHaveBeenCalledWith({ power: false });
  fireEvent.click(screen.getByText("Sala"));
  expect(onOpen).toHaveBeenCalled();
  fireEvent.change(screen.getByRole("slider"), { target: { value: "70" } });
  expect(onCommand).toHaveBeenCalledWith({ brightness: 70 });
});

test("lamp off, offline, hidden, colour mode", () => {
  const { onCommand } = r({
    hidden: true,
    state: { power: false, online: false, workMode: "colour", colorHex: "#ff0000" },
  });
  expect(screen.getByText("Desligada")).toBeTruthy();
  expect(screen.getByText("Offline")).toBeTruthy();
  expect(screen.getByText("Oculta")).toBeTruthy();
  expect(screen.getByText("#ff0000")).toBeTruthy();
  fireEvent.change(screen.getByRole("slider"), { target: { value: "50" } });
  expect(onCommand).toHaveBeenCalledWith({ colorHex: "#800000" });
});

test("lamp in white mode with stored colour shows Modo branco; no brightness hides slider", () => {
  r({ state: { colorHex: "#ff0000", brightness: null } });
  expect(screen.getByText("Modo branco")).toBeTruthy();
  expect(screen.queryByRole("slider")).toBeNull();
});

test("switch with several channels", () => {
  const { onCommand } = r({
    kind: "switch",
    state: { channels: { "2": false, "1": true } },
  });
  const labels = screen.getAllByText(/Canal/).map((e) => e.textContent);
  expect(labels).toEqual(["Canal 1", "Canal 2"]);
  fireEvent.click(screen.getAllByRole("switch")[1]!);
  expect(onCommand).toHaveBeenCalledWith({ channels: { "2": true } });
});

test("switch with one channel (on and off labels)", () => {
  r({ kind: "switch", state: { channels: { "1": true } } });
  expect(screen.getByText("Ligado")).toBeTruthy();
  cleanup();
  r({ kind: "switch", state: { channels: { "1": false } } });
  expect(screen.getByText("Desligado")).toBeTruthy();
});

test("switch without channels", () => {
  r({ kind: "switch", state: { channels: null } });
  expect(screen.getByText("Sem canais conhecidos ainda.")).toBeTruthy();
});

test("busy disables controls", () => {
  r({}, true);
  expect((screen.getByRole("switch") as HTMLButtonElement).disabled).toBe(true);
});
