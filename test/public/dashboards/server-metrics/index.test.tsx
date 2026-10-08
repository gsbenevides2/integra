import "@public/components/GlobalDrawerContext"; // load order: avoids dashboard <-> drawer import cycle

import React from "react";

import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";

import { fail, fakeRecharts, useApi } from "../../../helpers/dash-api";
import { renderWithProviders } from "../../../helpers/public-render";

const realRecharts = { ...(await import("recharts")) };
mock.module("recharts", () => fakeRecharts(React));
afterAll(() => mock.module("recharts", () => realRecharts));

const { ServerMetricsDashboard, serverMetricsDashboard } = await import("@public/dashboards/server-metrics/index");
const { DiskUsage } = await import("@public/dashboards/server-metrics/component/DiskUsage");

const snap = (i: number, usagePercent = 50) => ({
  id: String(i),
  memoryTotalMb: 100,
  memoryUsedMb: 40,
  memoryFreeMb: 60,
  networkRxKbs: 1,
  networkTxKbs: 2,
  disks: [
    { filesystem: `/dev/d${i}`, totalMb: 100, usedMb: usagePercent, freeMb: 1, usagePercent, mountedAt: "/" },
  ],
  collectedAt: `2024-01-0${i}T10:00:00.000Z`,
});
const speed = (i: number) => ({
  id: String(i),
  downloadMbps: 90.55,
  uploadMbps: 10.1,
  latencyMs: 12.4,
  collectedAt: `2024-01-0${i}T10:00:00.000Z`,
});

let history: unknown = { snapshots: [snap(1), snap(2)] };
let speedtest: unknown = { snapshots: [speed(1), speed(2)] };
useApi({
  "GET /api/server-metrics/history": () => history,
  "GET /api/server-metrics/speedtest/history": () => speedtest,
});
afterEach(() => {
  cleanup();
  history = { snapshots: [snap(1), snap(2)] };
  speedtest = { snapshots: [speed(1), speed(2)] };
});

describe("ServerMetricsDashboard", () => {
  test("renders speedtest and metric charts", async () => {
    renderWithProviders(<ServerMetricsDashboard />);
    expect(screen.getByText("Carregando métricas...")).toBeTruthy();
    await screen.findByText("Memória (MB)");
    fireEvent.click(screen.getByLabelText("Abrir menu"));
    expect(screen.getByText("Rede (kB/s)")).toBeTruthy();
    expect(screen.getByText("Velocidade da internet (Mbps)")).toBeTruthy();
    expect(screen.getByText("90.5 Mbps")).toBeTruthy();
    expect(screen.getByText("12 ms")).toBeTruthy();
    expect(screen.getByText("/dev/d2 (/)")).toBeTruthy();
    expect(serverMetricsDashboard.id).toBe("server-metrics");
  });

  test("empty data", async () => {
    history = {};
    speedtest = {};
    renderWithProviders(<ServerMetricsDashboard />);
    await screen.findByText("Ainda não há métricas coletadas");
    expect(screen.getByText("Ainda não há teste de velocidade coletado.")).toBeTruthy();
  });

  test("errors toast", async () => {
    history = fail();
    speedtest = fail();
    renderWithProviders(<ServerMetricsDashboard />);
    await screen.findByText("Falha ao buscar métricas do servidor");
    expect(screen.getByText("Falha ao buscar histórico de velocidade")).toBeTruthy();
  });

  test("snapshot without disks and poll refresh", async () => {
    history = { snapshots: [{ ...snap(1), disks: undefined }] };
    let tick: (() => void) | undefined;
    const orig = globalThis.setInterval;
    globalThis.setInterval = ((fn: () => void) => ((tick ??= fn), 1)) as any;
    renderWithProviders(<ServerMetricsDashboard />);
    globalThis.setInterval = orig;
    await screen.findByText("Sem dados de disco ainda.");
    history = { snapshots: [snap(1), snap(2)] };
    await act(async () => tick!());
    await screen.findByText("/dev/d2 (/)");
  });

  test("DiskUsage colours by usage", () => {
    const d = (usagePercent: number) => ({ filesystem: `f${usagePercent}`, totalMb: 1, usedMb: 1, freeMb: 0, usagePercent, mountedAt: "/" });
    const { container } = renderWithProviders(<DiskUsage disks={[d(95), d(80), d(10), d(150)]} />);
    expect(container.querySelectorAll(".bg-red-500").length).toBe(2);
    expect(container.querySelectorAll(".bg-orange-400").length).toBe(1);
    expect(container.querySelectorAll(".bg-green-500").length).toBe(1);
  });
});
