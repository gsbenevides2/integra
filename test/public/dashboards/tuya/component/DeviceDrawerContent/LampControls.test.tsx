import "@public/components/GlobalDrawerContext";

import React from "react";

import { LampControls } from "@public/dashboards/tuya/component/DeviceDrawerContent/LampControls";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, mock, test } from "bun:test";

import { device } from "../../../../../helpers/tuya-fixtures";

afterEach(cleanup);

type Over = Parameters<typeof device>[0];
function setup(over: Over = {}, isBusy = false) {
  const onCommand = mock((_c: unknown) => {});
  const view = render(<LampControls device={device(over)} isBusy={isBusy} onCommand={onCommand} />);
  const update = (next: Over) =>
    view.rerender(<LampControls device={device(next)} isBusy={isBusy} onCommand={onCommand} />);
  return { onCommand, update };
}
const ring = (name: string) => screen.getByRole("slider", { name });
const power = () => screen.getByLabelText(/Ligar|Desligar/);
const last = (fn: { mock: { lastCall?: unknown[] } }) => fn.mock.lastCall![0] as any;

test("offline", () => {
  setup({ state: { online: false } });
  expect(screen.getByText(/está offline/)).toBeTruthy();
});

test("white-only lamp: ring, power, brightness, temp presets", () => {
  const { onCommand } = setup({ state: { colorTemp: 50, colorHex: null } });
  expect(screen.queryByText("Branco")).toBeNull();
  fireEvent.keyDown(ring("Temperatura de cor"), { key: "ArrowRight" });
  expect(last(onCommand)).toEqual({ colorTemp: 51 });
  fireEvent.click(power());
  expect(last(onCommand)).toEqual({ power: false });
  fireEvent.change(screen.getByRole("slider", { name: /Brilho/ }), { target: { value: "70" } });
  expect(last(onCommand)).toEqual({ brightness: 70 });
  expect(screen.getByText("Ligada · 40%")).toBeTruthy();
  fireEvent.click(screen.getByText("Quente"));
  expect(last(onCommand)).toEqual({ colorTemp: 0 });
  fireEvent.click(screen.getByText("Neutro"));
  fireEvent.click(screen.getByText("Frio"));
  expect(last(onCommand)).toEqual({ colorTemp: 100 });
});

test("lamp with neither colour nor temp, off, no brightness", () => {
  const { onCommand } = setup({ state: { colorTemp: null, colorHex: null, brightness: null, power: false } });
  expect(screen.getByText("Desligada")).toBeTruthy();
  expect(screen.queryByRole("slider")).toBeNull();
  fireEvent.click(power());
  expect(last(onCommand)).toEqual({ power: true });
});

test("colour-only lamp in white mode shows only the power button", () => {
  setup({ state: { colorTemp: null, colorHex: "#ff0000", workMode: "white" } });
  expect(screen.queryByText("Branco")).toBeNull();
  expect(screen.queryByText("Quente")).toBeNull();
});

test("tabs switch mode and send the matching command", () => {
  const { onCommand } = setup({ state: { colorHex: "#00ff00", workMode: "white" } });
  fireEvent.click(screen.getByText("Branco")); // same tab: no command
  expect(onCommand).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Cor"));
  expect(last(onCommand)).toEqual({ colorHex: "#00ff00" });
  fireEvent.click(screen.getByText("Branco"));
  expect(last(onCommand)).toEqual({ workMode: "white" });
});

test("tab change without a known work mode sends nothing", () => {
  const { onCommand } = setup({ state: { colorHex: "#00ff00", workMode: null } });
  fireEvent.click(screen.getByText("Cor"));
  expect(onCommand).not.toHaveBeenCalled();
});

test("colour tab: ring, sliders, power, presets", () => {
  const { onCommand } = setup({ state: { colorHex: "#ff0000", workMode: "colour" } });
  fireEvent.keyDown(ring("Matiz"), { key: "ArrowRight" });
  expect(last(onCommand).colorHex).not.toBe("#ff0000");
  fireEvent.change(screen.getByRole("slider", { name: /Brilho/ }), { target: { value: "50" } });
  expect(last(onCommand).colorHex).toMatch(/^#/);
  fireEvent.change(screen.getByRole("slider", { name: /Saturação/ }), { target: { value: "50" } });
  fireEvent.click(power());
  expect(last(onCommand)).toEqual({ power: false });
  fireEvent.click(screen.getByLabelText("Cor #22d3ee"));
  expect(last(onCommand).colorHex).toMatch(/^#/);
});

test("follows external colour changes and keeps rounding noise", () => {
  const { update } = setup({ state: { colorHex: "#ff0000", workMode: "colour" } });
  expect(screen.getByLabelText("Cor #ff0000").className).toContain("ring-2");
  update({ state: { colorHex: "#fe0000", workMode: "colour" } }); // same colour
  expect(screen.getByLabelText("Cor #ff0000").className).toContain("ring-2");
  update({ state: { colorHex: "#0000ff", workMode: "colour" } });
  expect(screen.getByLabelText("Cor #3b82f6")).toBeTruthy();
  expect(ring("Matiz").getAttribute("aria-valuenow")).toBe("67");
  update({ state: { colorHex: null, workMode: "colour" } });
});

test("switching device re-picks the tab", () => {
  const { update } = setup({ id: "a", state: { colorHex: "#ff0000", workMode: "white" } });
  expect(screen.getByRole("slider", { name: "Temperatura de cor" })).toBeTruthy();
  update({ id: "b", state: { colorHex: "#ff0000", workMode: "colour" } });
  expect(screen.getByRole("slider", { name: "Matiz" })).toBeTruthy();
});

test("busy disables", () => {
  setup({}, true);
  expect((power() as HTMLButtonElement).disabled).toBe(true);
});
