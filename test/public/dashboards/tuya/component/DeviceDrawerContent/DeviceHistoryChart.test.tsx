import "@public/components/GlobalDrawerContext";

import React from "react";

import { cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, expect, test } from "bun:test";

import { mockRecharts, restoreRecharts } from "../../../../../helpers/tuya-recharts";

mockRecharts();
const { DeviceHistoryChart } = await import("@public/dashboards/tuya/component/DeviceDrawerContent/DeviceHistoryChart");
afterAll(restoreRecharts);
afterEach(cleanup);

const pt = (recordedAt: string, over = {}) => ({
  id: recordedAt,
  online: true,
  power: true,
  brightness: 50,
  colorTemp: null,
  colorHex: null,
  workMode: null,
  recordedAt,
  ...over,
});

test("empty history renders a single zero bucket", () => {
  render(<DeviceHistoryChart data={[]} />);
  expect(screen.getByTestId("area").getAttribute("data-data")).toContain('"brightness":0');
});

test("averages brightness per hour, off/offline = 0, null brightness = 100", () => {
  const data = [
    pt("2024-01-01T01:30:00Z", { power: false }),
    pt("2024-01-01T00:00:00Z"),
    pt("2024-01-01T01:00:00Z", { brightness: null }),
    pt("2024-01-01T03:00:00Z", { online: false }),
  ];
  render(<DeviceHistoryChart data={data} />);
  const buckets = JSON.parse(screen.getByTestId("area").getAttribute("data-data")!);
  expect(buckets.map((b: any) => b.brightness)).toEqual([50, 50, 0, 0]);
  expect(screen.getByTestId("tip").textContent).toContain("Brilho médio");
  expect(screen.getByText("Histórico")).toBeTruthy();
});

test("single point", () => {
  render(<DeviceHistoryChart data={[pt("2024-01-01T00:00:00Z")]} />);
  expect(JSON.parse(screen.getByTestId("area").getAttribute("data-data")!).length).toBe(1);
});
