import React from "react";

import { SwitchControls } from "@public/dashboards/tuya/component/DeviceDrawerContent/SwitchControls";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, mock, test } from "bun:test";

import { device } from "../../../../../helpers/tuya-fixtures";

afterEach(cleanup);

const r = (over: Parameters<typeof device>[0]) => {
  const onCommand = mock((_c: unknown) => {});
  render(
    <SwitchControls device={device({ kind: "switch", ...over })} isBusy={false} onCommand={onCommand} />,
  );
  return onCommand;
};

test("offline", () => {
  r({ state: { online: false } });
  expect(screen.getByText(/está offline/)).toBeTruthy();
});

test("no channels", () => {
  r({ state: { channels: {} } });
  expect(screen.getByText("Sem canais conhecidos ainda.")).toBeTruthy();
});

test("single channel labels and command", () => {
  const onCommand = r({ state: { channels: { "1": true } } });
  expect(screen.getByText("Ligado")).toBeTruthy();
  fireEvent.click(screen.getByRole("switch"));
  expect(onCommand).toHaveBeenCalledWith({ channels: { "1": false } });
  cleanup();
  r({ state: { channels: { "1": false } } });
  expect(screen.getByText("Desligado")).toBeTruthy();
});

test("multiple channels sorted numerically", () => {
  r({ state: { channels: { "10": true, "2": false } } });
  expect(screen.getAllByText(/Canal/).map((e) => e.textContent)).toEqual(["Canal 2", "Canal 10"]);
});
