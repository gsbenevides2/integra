import "@public/components/GlobalDrawerContext";

import React from "react";

import {
  EMPTY_PRESET_DRAFT,
  presetDraftFromPreset,
  presetDraftToBody,
  PresetForm,
} from "@public/dashboards/tuya/component/PresetForm/index";

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "@testing-library/react";
import { afterEach, expect, mock, test } from "bun:test";

import { field, preset } from "../../../../../helpers/tuya-fixtures";

afterEach(cleanup);

test("draft conversions", () => {
  expect(presetDraftFromPreset(preset({ workMode: "colour", colorHex: "#00ff00", brightness: null, colorTemp: null }))).toMatchObject({
    workMode: "colour",
    colorHex: "#00ff00",
    brightness: 100,
    colorTemp: 50,
  });
  expect(presetDraftFromPreset(preset({ workMode: null, colorHex: null }))).toMatchObject({ workMode: "colour", colorHex: "#ff0000" });
  const white = presetDraftFromPreset(preset());
  expect(white.workMode).toBe("white");
  expect(presetDraftToBody(white)).toMatchObject({ brightness: 80, colorTemp: 30, colorHex: null });
  expect(presetDraftToBody(EMPTY_PRESET_DRAFT)).toMatchObject({ brightness: null, colorTemp: null, colorHex: "#ff0000" });
});

function setup(draft = EMPTY_PRESET_DRAFT) {
  const onChange = mock((_d: unknown) => {});
  render(<PresetForm draft={draft} onChange={onChange} />);
  return onChange;
}

test("colour mode: name, tabs, ring, sliders, power", () => {
  const onChange = setup();
  fireEvent.change(field("Nome"), { target: { value: "X" } });
  expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_PRESET_DRAFT, name: "X" });
  fireEvent.click(screen.getByText("Branco"));
  expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_PRESET_DRAFT, workMode: "white" });
  fireEvent.click(screen.getByText("Cor"));
  fireEvent.keyDown(screen.getByRole("slider", { name: "Matiz" }), { key: "ArrowRight" });
  expect((onChange.mock.lastCall![0] as any).colorHex).not.toBe("#ff0000");
  fireEvent.change(screen.getByRole("slider", { name: /Brilho/ }) , { target: { value: "50" } });
  expect((onChange.mock.lastCall![0] as any).colorHex).toBe("#800000");
  fireEvent.change(screen.getByRole("slider", { name: /Saturação/ }), { target: { value: "50" } });
  expect((onChange.mock.lastCall![0] as any).colorHex).toBe("#ff8080");
  fireEvent.click(screen.getByRole("switch"));
  expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_PRESET_DRAFT, power: false });
});

test("white mode: ring and brightness", () => {
  const draft = { ...EMPTY_PRESET_DRAFT, workMode: "white" as const, power: false };
  const onChange = setup(draft);
  expect(screen.getByText("Mantém desligada ao aplicar")).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("slider", { name: "Temperatura de cor" }), { key: "ArrowRight" });
  expect((onChange.mock.lastCall![0] as any).colorTemp).toBe(51);
  fireEvent.change(screen.getByRole("slider", { name: /Brilho/ }) , { target: { value: "20" } });
  expect((onChange.mock.lastCall![0] as any).brightness).toBe(20);
});
