import { alongRoute, decodePolyline, findNearbyStops, haversine, nextDepartures } from "@server/modules/nearby-bus/service/eta";

import { describe, expect, test } from "bun:test";

import { encodePolyline, makeLine, vehicle } from "./fixtures";

// Wed 2026-10-28 10:00 BRT; Sat 10/31 and Sun 11/01 at 10:00 BRT.
const WED = new Date("2026-10-28T13:00:00Z");
const SAT = new Date("2026-10-31T13:00:00Z");
const SUN = new Date("2026-11-01T13:00:00Z");
const LNG = -46.3;

describe("geometry", () => {
  test("polyline round-trips and haversine measures meters", () => {
    const pts: [number, number][] = [[-23.6, LNG], [-23.61, LNG]];
    expect(decodePolyline(encodePolyline(pts))).toEqual(pts);
    expect(haversine(pts[0]!, pts[1]!)).toBeGreaterThan(1100);
    expect(haversine(pts[0]!, pts[1]!)).toBeLessThan(1120);
  });

  test("alongRoute projects onto the path, clamps and tolerates a degenerate segment", () => {
    const path: [number, number][] = [[-23.6, LNG], [-23.6, LNG], [-23.61, LNG]];
    expect(alongRoute(path, [-23.605, LNG + 0.0001])).toBeCloseTo(555, -1);
    expect(alongRoute(path, [-23.7, LNG])).toBeCloseTo(1112, -1);
    expect(alongRoute(path, [-23.5, LNG])).toBe(0);
  });
});

describe("nextDepartures", () => {
  const route = makeLine(0).rotas[0]!;
  test("picks the weekday, saturday or sunday table", () => {
    expect(nextDepartures(route, WED).map((a) => a.time)).toEqual(["10:30", "11:00", "12:00"]);
    expect(nextDepartures(route, WED)[0]).toEqual({ source: "schedule", etaMin: 30, time: "10:30" });
    expect(nextDepartures(route, SAT).map((a) => a.time)).toEqual(["10:15", "10:45"]);
    expect(nextDepartures(route, SUN).map((a) => a.time)).toEqual(["10:20"]);
  });
  test("is empty after the last departure", () => {
    expect(nextDepartures(route, new Date("2026-10-30T02:30:00Z"))).toEqual([]);
  });
});

describe("findNearbyStops", () => {
  const now = WED.getTime();

  test("mid-route stop: live arrivals toward Ribeirão, fresh vehicles still ahead only", () => {
    const stops = findNearbyStops([makeLine(now)], [-23.6201, LNG], WED);
    expect(stops).toHaveLength(1);
    const s = stops[0]!;
    expect(s).toMatchObject({ line: "381", direction: "volta", destination: "RIBEIRAO PIRES", otherEnd: "SUZANO (BARUEL)", address: "Pena", terminal: false });
    expect(s.distanceM).toBeLessThan(20);
    expect(s.arrivals.map((a) => a.vehicle)).toEqual(["AHEAD", "FAR"]);
    expect(s.arrivals[0]).toMatchObject({ source: "live", etaMin: 2, lat: -23.61, lng: LNG });
    expect(s).toMatchObject({ lat: -23.62, lng: LNG });
    expect(s.path).toBe(makeLine(now).rotas[1]!.encode);
    expect(s.arrivals[1]!.etaMin).toBeGreaterThan(s.arrivals[0]!.etaMin);
  });

  test("falls back to 20 km/h when the average speed is 0", () => {
    const [s] = findNearbyStops([makeLine(now, { velocidadeMedia: 0 })], [-23.62, LNG], WED);
    expect(s!.arrivals[0]!.etaMin).toBe(3);
  });

  test("terminal: shows departures from the schedule, not the arrival side", () => {
    const stops = findNearbyStops([makeLine(now)], [-23.6401, LNG], WED);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({ direction: "ida", terminal: true, address: "Terminal" });
    expect(stops[0]!.arrivals.map((a) => a.time)).toEqual(["10:30", "11:00", "12:00"]);
  });

  test("no fresh vehicle ahead: uses the schedule; nothing left: empty", () => {
    const line = makeLine(now, { veiculos: [vehicle({ latitude: -23.63 }, now)] });
    expect(findNearbyStops([line], [-23.62, LNG], WED)[0]!.arrivals[0]).toMatchObject({ source: "schedule", time: "10:30" });
    expect(findNearbyStops([line], [-23.62, LNG], new Date("2026-10-30T02:30:00Z"))[0]!.arrivals).toEqual([]);
  });

  test("ignores routes without stops and positions far from any stop", () => {
    const line = makeLine(now);
    line.rotas[0]!.pontos = [];
    expect(findNearbyStops([line], [-23.62, LNG], WED)).toHaveLength(1);
    expect(findNearbyStops([makeLine(now)], [-23.7, LNG], WED)).toEqual([]);
  });

  test("sorts by distance across lines", () => {
    const a = makeLine(now, { codigo: "215" });
    const b = makeLine(now);
    b.rotas[1]!.pontos[1]!.latitude = -23.6203;
    const stops = findNearbyStops([b, a], [-23.62, LNG], WED);
    expect(stops.map((s) => s.line)).toEqual(["215", "381"]);
  });

  test("the preferred stop wins over other nearby stops", () => {
    const pena = makeLine(now, { codigo: "215" });
    pena.rotas[1]!.pontos[1] = { latitude: -23.639141, longitude: -46.322004, endereco: "Pena" };
    const other = makeLine(now);
    other.rotas[1]!.pontos[1] = { latitude: -23.6432, longitude: -46.3215, endereco: "Outro" };
    const stops = findNearbyStops([other, pena], [-23.6431, -46.3213], WED);
    expect(stops.map((s) => s.address)).toEqual(["Pena"]);
  });

  test("defaults `now` to the current time", () => {
    expect(findNearbyStops([makeLine(Date.now())], [-23.7, LNG])).toEqual([]);
  });
});
