import React from "react";

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, expect, mock, test } from "bun:test";

import { fail, mockTuyaFetch } from "../../../../../helpers/tuya-fetch";
import { field, sensor } from "../../../../../helpers/tuya-fixtures";
import { mockRecharts, restoreRecharts } from "../../../../../helpers/tuya-recharts";
import { renderTuya } from "../../../../../helpers/tuya-render";

mockRecharts();
const { SensorDrawerContent } = await import("@public/dashboards/tuya/component/SensorDrawerContent/index");
afterAll(restoreRecharts);

let m: ReturnType<typeof mockTuyaFetch>;
afterEach(() => {
  cleanup();
  m?.restore();
});

const rd = (code: string, value: string, h: number) => ({
  id: code + h,
  code,
  value,
  recordedAt: `2024-01-01T0${h}:00:00Z`,
});

const history = (all: ReturnType<typeof rd>[]) => (c: any) => ({
  readings: all.filter((r) => r.code === c.query.get("code")),
});

test("empty history message, saving, and failure", async () => {
  m = mockTuyaFetch({
    "GET /api/tuya/sensors/s1/history": () => ({ readings: [] }),
    "PUT /api/tuya/sensors/s1": () => ({ ok: 1 }),
  });
  const onChanged = mock(() => {});
  renderTuya(<SensorDrawerContent sensor={sensor({ lastEventAt: "2024-01-01T00:00:00Z", category: null })} onChanged={onChanged} />);
  await screen.findByText(/Sem histórico ainda/);
  expect(screen.getByText("-")).toBeTruthy();
  fireEvent.change(field("Nome"), { target: { value: "Nova" } });
  fireEvent.click(screen.getByText("Salvar"));
  await screen.findByText("Sensor salvo");
  expect(m.calls.at(-1)!.body).toEqual({ name: "Nova" });
  expect(onChanged).toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole("switch")[0]!);
  await waitFor(() => expect(m.calls.at(-1)!.body).toEqual({ enabled: false }));
  fireEvent.click(screen.getAllByRole("switch")[1]!);
  await waitFor(() => expect(m.calls.at(-1)!.body).toEqual({ hidden: true }));
});

test("save failure toasts", async () => {
  m = mockTuyaFetch({ "GET /api/tuya/sensors/s1/history": () => ({}), "PUT /api/tuya/sensors/s1": fail });
  renderTuya(<SensorDrawerContent sensor={sensor({ enabled: false, hidden: true })} onChanged={() => {}} />);
  expect(screen.getByText("Pausado")).toBeTruthy();
  expect(screen.getByText("Oculto no painel")).toBeTruthy();
  expect(screen.getByText("nenhum")).toBeTruthy();
  fireEvent.click(screen.getByText("Salvar"));
  await screen.findByText("Falha ao salvar o sensor");
});

test("history with battery percentage and pir", async () => {
  m = mockTuyaFetch({
    "GET /api/tuya/sensors/s1/history": history([
      rd("battery_percentage", "90", 1),
      rd("pir_state", "pir", 1),
      rd("pir_state", "none", 2),
      rd("va_temperature", "200", 1),
    ]),
  });
  renderTuya(<SensorDrawerContent sensor={sensor()} onChanged={() => {}} />);
  await screen.findByText("Bateria");
  expect(screen.getByText("Detecções de movimento")).toBeTruthy();
  expect(screen.getByText("Temperatura")).toBeTruthy();
});

test("history with battery state levels (known and unknown)", async () => {
  m = mockTuyaFetch({
    "GET /api/tuya/sensors/s1/history": (c: any) =>
      c.query.get("code") === "va_humidity"
        ? fail()
        : history([rd("battery_state", "low", 1), rd("battery_state", "weird", 2), rd("battery_state", "high", 3), rd("va_temperature", "200", 1)])(c),
  });
  renderTuya(<SensorDrawerContent sensor={sensor()} onChanged={() => {}} />);
  await screen.findByText("Bateria");
  expect(screen.getAllByTestId("line-type").map((e) => e.textContent)).toContain("stepAfter");
});

test("unmounting before history arrives is safe", async () => {
  m = mockTuyaFetch({ "GET /api/tuya/sensors/s1/history": () => ({ readings: [] }) });
  const { unmount } = renderTuya(<SensorDrawerContent sensor={sensor()} onChanged={() => {}} />);
  unmount();
  await new Promise((r) => setTimeout(r, 10));
});
