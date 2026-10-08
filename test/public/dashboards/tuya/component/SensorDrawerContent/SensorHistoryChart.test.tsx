import "@public/components/GlobalDrawerContext";

import React from "react";

import { cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, expect, test } from "bun:test";

import { mockRecharts, restoreRecharts } from "../../../../../helpers/tuya-recharts";

mockRecharts();
const { SensorHistoryChart } = await import("@public/dashboards/tuya/component/SensorDrawerContent/SensorHistoryChart");
afterAll(restoreRecharts);
afterEach(cleanup);

const rd = (code: string, value: string, at: string) => ({ id: at + code, code, value, recordedAt: at });
const T = (h: number) => `2024-01-01T0${h}:00:00Z`;

test("nothing for missing code or non-numeric values", () => {
  const { container } = render(<SensorHistoryChart readings={[rd("x", "1", T(1))]} code="a" label="L" />);
  expect(container.innerHTML).toBe("");
  cleanup();
  const r = render(<SensorHistoryChart readings={[rd("a", "abc", T(1))]} code="a" label="L" />);
  expect(r.container.innerHTML).toBe("");
});

test("numeric line scaled with unit", () => {
  render(
    <SensorHistoryChart
      readings={[rd("a", "200", T(1)), rd("a", "220", T(2))]}
      code="a"
      label="Temperatura"
      scale={10}
      unit=" °C"
    />,
  );
  const pts = JSON.parse(screen.getByTestId("line").getAttribute("data-data")!);
  expect(pts.map((p: any) => p.value)).toEqual([20, 22]);
  expect(screen.getByTestId("tip").textContent).toContain("2.0 °C");
  expect(screen.getByTestId("line-type").textContent).toBe("monotone");
});

test("levels draw steps with labels", () => {
  render(
    <SensorHistoryChart
      readings={[rd("a", "1", T(1)), rd("a", "3", T(2))]}
      code="a"
      label="Bateria"
      levels={["Baixa", "Média", "Alta"]}
    />,
  );
  expect(screen.getByTestId("line-type").textContent).toBe("stepAfter");
  expect(screen.getByTestId("y").textContent).toBe("Baixa");
  expect(screen.getByTestId("tip").textContent).toContain("Média");
});

test("boolean readings become bars", () => {
  render(
    <SensorHistoryChart
      readings={[rd("a", "true", T(1)), rd("a", "false", T(2)), rd("a", "true", T(2))]}
      code="a"
      label="Porta"
      boolean
      eventLabel="aberturas"
    />,
  );
  const bars = JSON.parse(screen.getByTestId("bar").getAttribute("data-data")!);
  expect(bars.length).toBe(2);
  expect(screen.getByTestId("tip").textContent).toContain("2 aberturas");
  expect(screen.getByTestId("tip").textContent).toContain("por hora");
});

test("bars per day for long spans", () => {
  render(
    <SensorHistoryChart
      readings={[rd("a", "true", "2024-01-01T00:00:00Z"), rd("a", "true", "2024-02-01T00:00:00Z")]}
      code="a"
      label="Porta"
      boolean
    />,
  );
  expect(screen.getByTestId("tip").textContent).toContain("por dia");
  expect(screen.getByTestId("tip").textContent).toContain("eventos");
});
