import React from "react";

import type { NearbyStop } from "@server/modules/nearby-bus/model";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

const { NearbyBusMap } = await import("@public/dashboards/nearby-bus/NearbyBusMap");

const created: { kind: string; opts: any }[] = [];
let fitCalls = 0;
let removed = 0;
const shape = (kind: string) =>
  class {
    opts: any;
    constructor(...args: any[]) {
      this.opts = args.at(-1);
      created.push({ kind, opts: args.at(-1) });
    }
    setMap(m: unknown) {
      if (m === null) removed++;
    }
  };
const fakeGoogle = () => ({
  maps: {
    Map: class {
      constructor() {
        created.push({ kind: "map", opts: {} });
      }
      fitBounds() {
        fitCalls++;
      }
    },
    Marker: shape("marker"),
    Polyline: shape("polyline"),
    LatLngBounds: class {
      extend() {}
    },
    Size: class {},
    Point: class {},
    SymbolPath: { CIRCLE: 0 },
    geometry: { encoding: { decodePath: (s: string) => [s] } },
  },
});

const position = { lat: -23.64, lng: -46.32 };
const stop = (over: Partial<NearbyStop> = {}): NearbyStop => ({
  line: "381", direction: "volta" as const, destination: "R", otherEnd: "SUZANO (CENTRO)", address: "Rua A", lat: -23.642, lng: -46.321,
  path: "abc", distanceM: 5, terminal: false, arrivals: [], ...over,
});

let appended: HTMLScriptElement[] = [];
beforeEach(() => {
  created.length = 0;
  fitCalls = 0;
  removed = 0;
  appended = [];
  spyOn(document.head, "append").mockImplementation(((s: HTMLScriptElement) => appended.push(s)) as never);
});
afterEach(() => {
  cleanup();
  delete (globalThis as any).google;
  (document.head.append as any).mockRestore?.();
});

describe("NearbyBusMap", () => {
  test("shows a message when the script fails, then retries on the next mount", async () => {
    render(<NearbyBusMap apiKey="k&1" position={position} stops={[]} />);
    expect(appended[0]!.src).toContain("key=k%261");
    appended[0]!.onerror!(new Event("error"));
    await screen.findByText("Não foi possível carregar o mapa.");
    cleanup();

    const { rerender } = render(<NearbyBusMap apiKey="k&1" position={position} stops={[]} />);
    expect(appended).toHaveLength(2);
    (globalThis as any).google = fakeGoogle();
    appended[1]!.onload!(new Event("load"));
    await waitFor(() => expect(created.some((c) => c.kind === "map")).toBe(true));
    rerender(<NearbyBusMap apiKey="k&1" position={position} stops={[]} />);
  });

  test("draws user, stops, routes and live vehicles, highlighting the nearest bus", async () => {
    (globalThis as any).google = fakeGoogle();
    const stops = [
      stop({
        arrivals: [
          { source: "live", etaMin: 2, vehicle: "V1", lat: -23.63, lng: -46.32 },
          { source: "live", etaMin: 0, vehicle: "V2", lat: -23.64, lng: -46.32 },
          { source: "schedule", etaMin: 9, time: "10:00" },
        ],
      }),
      stop({ line: "9", arrivals: [] }),
    ];
    const nearest = { line: "381", vehicle: "V2", etaMin: 0 };
    const { rerender } = render(<NearbyBusMap apiKey="k" position={position} stops={stops} nearest={nearest} />);
    await waitFor(() => expect(fitCalls).toBe(1));
    expect(appended).toHaveLength(0); // google.maps was already there: no script
    const markers = created.filter((c) => c.kind === "marker");
    expect(markers).toHaveLength(2 + 2 + 2); // 2 stops + 2 vehicles + user dot and halo
    const pills = markers.filter((m) => decodeURIComponent(m.opts.icon.url ?? "").includes("381 · Chegando"));
    expect(pills).toHaveLength(1); // only the nearest bus gets the bubble
    const colors = created.filter((c) => c.kind === "polyline").map((c) => c.opts.strokeColor);
    expect(colors).toEqual(["#51a2ff", "#99a1af"]);
    expect(created.find((c) => c.kind === "map")).toBeDefined();

    rerender(<NearbyBusMap apiKey="k" position={{ lat: -23.65, lng: -46.32 }} stops={stops} nearest={nearest} />);
    await waitFor(() => expect(removed).toBe(8)); // 6 markers + 2 polylines cleared
    expect(fitCalls).toBe(1); // same nearest bus: the user's pan/zoom is kept

    rerender(<NearbyBusMap apiKey="k" position={position} stops={stops} nearest={{ ...nearest, vehicle: "V1" }} />);
    await waitFor(() => expect(fitCalls).toBe(2)); // another bus became the nearest: reframe
  });
});
