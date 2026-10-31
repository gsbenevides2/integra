import "@public/components/GlobalDrawerContext"; // load order: avoids dashboard <-> drawer import cycle

import React from "react";

import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { fail, useApi } from "../../../helpers/dash-api";
import { renderWithProviders } from "../../../helpers/public-render";

const { NearbyBusDashboard, nearbyBusDashboard } = await import("@public/dashboards/nearby-bus/index");

const stop = (over: object) => ({
  line: "381", direction: "volta", destination: "RIBEIRAO PIRES (TERMINAL RODOVIARIO)", otherEnd: "SUZANO (BARUEL)",
  address: "SP-031 Rod. Índio Tibiriçá, km 59 oeste - Recanto Feliz, Suzano", distanceM: 60,
  terminal: false, arrivals: [], ...over,
});
let reply: unknown = { stops: [] };
let mapReply: unknown = { apiKey: null };
const calls = useApi({
  "GET /api/nearby-bus": () => reply,
  "GET /api/nearby-bus/map-config": () => mapReply,
});

type GeoCb = (p: { coords: { latitude: number; longitude: number } }) => void;
let onFix: GeoCb | undefined;
let onErr: ((e: { code: number; PERMISSION_DENIED: number }) => void) | undefined;
let cleared = false;
const realGeo = Object.getOwnPropertyDescriptor(navigator, "geolocation");
const setGeo = (value: unknown) => Object.defineProperty(navigator, "geolocation", { value, configurable: true });
beforeEach(() => {
  onFix = onErr = undefined;
  cleared = false;
  reply = { stops: [] };
  mapReply = { apiKey: null };
  setGeo({
    watchPosition: (ok: GeoCb, err: NonNullable<typeof onErr>) => {
      onFix = ok;
      onErr = err;
      return 7;
    },
    clearWatch: () => (cleared = true),
  });
});
afterEach(() => {
  cleanup();
  delete (globalThis as any).google;
  if (realGeo) Object.defineProperty(navigator, "geolocation", realGeo);
  else delete (navigator as { geolocation?: unknown }).geolocation;
});

const busCalls = () => calls.filter((c) => c.path === "/api/nearby-bus");
const fix = () => act(async () => onFix!({ coords: { latitude: -23.62, longitude: -46.3 } }));

describe("NearbyBusDashboard", () => {
  test("asks for location, then lists live and scheduled arrivals", async () => {
    reply = {
      stops: [
        stop({ arrivals: [{ source: "live", etaMin: 0, vehicle: "A1" }, { source: "live", etaMin: 4, vehicle: "B2" }] }),
        stop({ line: "215", otherEnd: "SUZANO", distanceM: 3, arrivals: [{ source: "schedule", etaMin: 9, time: "10:30" }] }),
        stop({ line: "9", terminal: true, arrivals: [{ source: "schedule", etaMin: 5, time: "10:35" }] }),
        stop({ line: "8", arrivals: [] }),
      ],
    };
    renderWithProviders(<NearbyBusDashboard />);
    expect(nearbyBusDashboard.id).toBe("nearby-bus");
    screen.getByText("Buscando sua localização…");
    fireEvent.click(screen.getByLabelText("Abrir menu"));
    await fix();
    await screen.findByText("Chegando");
    screen.getByText("4 min");
    screen.getByText("ônibus A1 · ao vivo");
    expect(screen.getAllByText("Mais próximo")).toHaveLength(1); // A1 is the nearest bus, on the 381 card
    screen.getByText("Sem ônibus com sinal — próximas saídas da origem");
    screen.getByText("10:30");
    screen.getByText("Próximas saídas");
    screen.getByText("Saindo para Ribeirao Pires");
    screen.getByText("Sem mais horários hoje");
    expect(screen.getAllByText("Baruel")).toHaveLength(3); // 381, terminal 9 and 8 share the same far end
    screen.getByText("Suzano"); // no parenthesis: falls back to the whole name
    expect(screen.getAllByText(/Rod\. Índio Tibiriçá, km 59 oeste · a 60 m/)).toHaveLength(3);
    screen.getByText(/você está no ponto/);
    expect(busCalls()[0]!.query).toEqual({ lat: "-23.62", lng: "-46.3" });
  });

  test("renders the map when a key is configured and there are stops", async () => {
    let maps = 0;
    const noop = class { setMap() {} extend() {} fitBounds() {} };
    (globalThis as any).google = {
      maps: {
        Map: class extends noop { constructor() { super(); maps++; } },
        Marker: noop, Polyline: noop, LatLngBounds: noop, Size: noop, Point: noop,
        SymbolPath: { CIRCLE: 0 },
        geometry: { encoding: { decodePath: () => [] } },
      },
    };
    mapReply = { apiKey: "k" };
    reply = { stops: [stop({ lat: -23.64, lng: -46.32, path: "", arrivals: [{ source: "live", etaMin: 3, vehicle: "A1", lat: -23.63, lng: -46.32 }] })] };
    renderWithProviders(<NearbyBusDashboard />);
    await fix();
    await screen.findByText("3 min");
    await waitFor(() => expect(maps).toBe(1));
  });

  test("shows the empty state", async () => {
    renderWithProviders(<NearbyBusDashboard />);
    await fix();
    await screen.findByText("Nenhum ponto das linhas 381 e 215 por perto");
  });

  test("polls again on the interval", async () => {
    const orig = globalThis.setInterval;
    let tick: (() => void) | undefined;
    globalThis.setInterval = ((fn: () => void) => ((tick ??= fn), 1)) as never;
    try {
      renderWithProviders(<NearbyBusDashboard />);
      await fix();
      await screen.findByText("Nenhum ponto das linhas 381 e 215 por perto");
      expect(busCalls()).toHaveLength(1);
      await act(async () => tick!());
      expect(busCalls()).toHaveLength(2);
    } finally {
      globalThis.setInterval = orig;
    }
  });

  test("toasts when the request fails", async () => {
    reply = fail();
    renderWithProviders(<NearbyBusDashboard />);
    await fix();
    await screen.findByText("Falha ao buscar ônibus");
  });

  test("explains denied permission and stops watching on unmount", async () => {
    const { unmount } = renderWithProviders(<NearbyBusDashboard />);
    await act(async () => onErr!({ code: 1, PERMISSION_DENIED: 1 }));
    screen.getByText("Permita o acesso à localização para ver os ônibus perto de você.");
    unmount();
    expect(cleared).toBe(true);
  });

  test("keeps trying when the position is unavailable and recovers on a fix", async () => {
    renderWithProviders(<NearbyBusDashboard />);
    await act(async () => onErr!({ code: 2, PERMISSION_DENIED: 1 }));
    screen.getByText("Não consegui obter sua localização agora, tentando de novo…");
    await fix();
    expect(screen.queryByText("Não consegui obter sua localização agora, tentando de novo…")).toBeNull();
  });

  test("lets the user pick the Pena stop or the Ribeirão Pires terminal instead of the GPS", async () => {
    renderWithProviders(<NearbyBusDashboard />);
    await fix();
    fireEvent.click(screen.getByRole("button", { name: "Terminal Ribeirão Pires" }));
    await waitFor(() =>
      expect(calls.some((c) => c.path === "/api/nearby-bus" && c.query.lat === "-23.712173" && c.query.lng === "-46.415905")).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ponto da Pena" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/api/nearby-bus" && c.query.lat === "-23.639141")).toBe(true));
    expect(screen.getByRole("button", { name: "Ponto da Pena" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Minha localização" }));
    await waitFor(() => expect(calls.at(-1)?.query.lat).toBe("-23.62"));
  });

  test("handles browsers without geolocation", () => {
    setGeo(undefined);
    renderWithProviders(<NearbyBusDashboard />);
    screen.getByText("Este navegador não suporta geolocalização.");
  });
});
