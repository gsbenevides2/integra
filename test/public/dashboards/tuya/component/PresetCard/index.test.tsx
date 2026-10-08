import React from "react";

import { PresetCard } from "@public/dashboards/tuya/component/PresetCard/index";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, mock, test } from "bun:test";

import { preset } from "../../../../../helpers/tuya-fixtures";

afterEach(cleanup);

test("white preset without quick apply", () => {
  const onOpen = mock(() => {});
  const onApply = mock(() => {});
  render(<PresetCard preset={preset()} onOpen={onOpen} onApply={onApply} />);
  expect(screen.getByText("Branco · 80%")).toBeTruthy();
  fireEvent.click(screen.getByText("Leitura"));
  fireEvent.click(screen.getByText("Aplicar"));
  expect(onOpen).toHaveBeenCalled();
  expect(onApply).toHaveBeenCalled();
});

test("colour preset with quick apply", () => {
  const onQuickApply = mock(() => {});
  render(
    <PresetCard
      preset={preset({ workMode: "colour", colorHex: "#ff0000", brightness: null })}
      onOpen={() => {}}
      onApply={() => {}}
      firstOnlineDeviceName="Sala"
      onQuickApply={onQuickApply}
    />,
  );
  expect(screen.getByText("#ff0000 · 100%")).toBeTruthy();
  fireEvent.click(screen.getByText(/Aplicar na/));
  expect(onQuickApply).toHaveBeenCalled();
  expect(screen.getByText(/Aplicar em outra/)).toBeTruthy();
});

test("no brightness at all", () => {
  render(<PresetCard preset={preset({ brightness: null })} onOpen={() => {}} onApply={() => {}} />);
  expect(screen.getByText("Branco")).toBeTruthy();
});
