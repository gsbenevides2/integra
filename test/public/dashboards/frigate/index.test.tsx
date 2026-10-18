import "@public/components/GlobalDrawerContext"; // load order: avoids dashboard <-> drawer import cycle

import React from "react";

import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, test } from "bun:test";

import { fail, useApi } from "../../../helpers/dash-api";
import { renderWithProviders } from "../../../helpers/public-render";

const { FrigateDashboard, frigateDashboard } = await import("@public/dashboards/frigate/index");

const stats = {
  cameras: {
    frente: { fps: 5.1, skippedFps: 0, detectionFps: 40, detecting: true },
    tras: { fps: 0, skippedFps: 1.5, detectionFps: 0, detecting: false },
  },
  detector: { name: "openvino", inferenceMs: 8.5 },
  disk: { total: 1000 * 1024, used: 950 * 1024, free: 50 * 1024 },
  gpu: { name: "intel-vaapi", usage: "3.0%", memory: "-%" },
  memory: [{ name: "Cache", total: 1000, used: 100 }],
  version: "0.17.2-abc",
  latestVersion: "0.18.0",
  uptime: 86400 * 6 + 3600 * 2,
};

let reply: unknown = stats;
let broken = false;
useApi({ "GET /api/frigate/stats": () => (broken ? fail() : reply) });
afterEach(() => {
  cleanup();
  broken = false;
});

test("renders cameras, storage, performance and service", async () => {
  renderWithProviders(<FrigateDashboard />);
  expect(screen.getByText("Carregando...")).toBeTruthy();
  await screen.findByText("frente");
  expect(screen.getAllByRole("status").map((s) => s.getAttribute("aria-label"))).toEqual(["Online", "Sem sinal"]);
  expect(screen.getByText("desligada")).toBeTruthy();
  expect(screen.getByText(/950 GB de 1000 GB · 95%/)).toBeTruthy();
  expect(screen.getByText("8.5 ms por inferência")).toBeTruthy();
  expect(screen.getByText("3.0%")).toBeTruthy();
  expect(screen.getByText("0.18.0 disponível")).toBeTruthy();
  expect(screen.getByText("6 d 2 h")).toBeTruthy();
  expect(frigateDashboard.id).toBe("frigate");
});

test("shows an error when Frigate is unavailable", async () => {
  broken = true;
  renderWithProviders(<FrigateDashboard />);
  await screen.findByText("Frigate indisponível");
});
