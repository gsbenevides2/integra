import React from "react";

import { SensorCard } from "@public/dashboards/tuya/component/SensorCard/index";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, mock, test } from "bun:test";

import { sensor } from "../../../../../helpers/tuya-fixtures";

afterEach(cleanup);

const r = (over: Parameters<typeof sensor>[0], onOpen = () => {}) =>
  render(<SensorCard sensor={sensor(over)} onOpen={onOpen} />);

test("door open/closed, battery percentage, tamper, click", () => {
  const onOpen = mock(() => {});
  r(
    {
      readings: {
        doorcontact_state: "true",
        battery_percentage: "80",
        temper_alarm: "true",
      },
    },
    onOpen,
  );
  expect(screen.getByText("Aberta")).toBeTruthy();
  expect(screen.getByText("80%")).toBeTruthy();
  expect(screen.getByText("Violação")).toBeTruthy();
  expect(screen.getByText("Online")).toBeTruthy();
  fireEvent.click(screen.getByRole("button"));
  expect(onOpen).toHaveBeenCalled();
});

test("door closed + offline + hidden + battery state map", () => {
  r({
    online: false,
    hidden: true,
    readings: { doorcontact_state: "false", battery_state: "middle" },
  });
  expect(screen.getByText("Fechada")).toBeTruthy();
  expect(screen.getByText("Offline")).toBeTruthy();
  expect(screen.getByText("Oculto")).toBeTruthy();
  expect(screen.getByText("média")).toBeTruthy();
});

test("unknown battery state falls back to raw", () => {
  r({ readings: { battery_state: "weird" } });
  expect(screen.getByText("weird")).toBeTruthy();
});

test("temperature and humidity", () => {
  r({
    kind: "temperature_humidity",
    readings: { va_temperature: "215", va_humidity: "55" },
  });
  expect(screen.getByText("21.5 °C")).toBeTruthy();
  expect(screen.getByText("55 %")).toBeTruthy();
});

test("temperature/humidity unparsable or absent", () => {
  r({
    kind: "temperature_humidity",
    readings: { va_temperature: "abc", va_humidity: "xyz" },
  });
  expect(screen.queryByText("Temperatura")).toBeNull();
  expect(screen.queryByText("Umidade")).toBeNull();
  cleanup();
  r({ kind: "temperature_humidity", readings: { x: "1" } });
  expect(screen.queryByText("Temperatura")).toBeNull();
});

test("motion detected, clear, and absent", () => {
  r({ kind: "motion", readings: { pir_state: "pir" } });
  expect(screen.getByText("Detectado")).toBeTruthy();
  cleanup();
  r({ kind: "motion", readings: { pir: "none" } });
  expect(screen.getByText("Nenhum")).toBeTruthy();
  cleanup();
  r({ kind: "motion", readings: { other: "1" } });
  expect(screen.queryByText("Movimento")).toBeNull();
});

test("unknown kind with no readings is silent", () => {
  r({ kind: "unknown", readings: {} });
  expect(screen.getByText(/não publica nenhum dado/)).toBeTruthy();
});
