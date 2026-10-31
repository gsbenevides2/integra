import {
  type Arrival,
  DEFAULT_SPEED_KMH,
  MAX_ARRIVALS,
  type NearbyStop,
  type PortalLine,
  type PortalRoute,
  PREFERRED_STOP,
  RADIUS_M,
  STALE_MS,
} from "../model";

type Point = [lat: number, lng: number];

const EARTH_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: Point, b: Point): number {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

/** Google encoded polyline (precision 5). */
export function decodePolyline(encoded: string): Point[] {
  const points: Point[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(i++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < encoded.length) {
    lat += next();
    lng += next();
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/** Meters travelled along the path up to the point of it closest to `p`. */
export function alongRoute(path: Point[], p: Point): number {
  let best = Infinity;
  let bestOffset = 0;
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const segLen = haversine(a, b);
    // Local flat projection: fine for segments of a few hundred meters.
    const kx = Math.cos(rad(a[0]));
    const abx = (b[1] - a[1]) * kx;
    const aby = b[0] - a[0];
    const len2 = abx * abx + aby * aby;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (((p[1] - a[1]) * kx) * abx + (p[0] - a[0]) * aby) / len2));
    const d = haversine([a[0] + aby * t, a[1] + (abx * t) / kx], p);
    if (d < best) {
      best = d;
      bestOffset = walked + segLen * t;
    }
    walked += segLen;
  }
  return bestOffset;
}

function localClock(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { weekday: parts.weekday!, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

// ponytail: holidays use the weekday table, and the day never rolls over to tomorrow's first buses.
export function nextDepartures(route: PortalRoute, now: Date): Arrival[] {
  const { weekday, minutes } = localClock(now);
  const table =
    weekday === "Sun"
      ? route.horariosdomingosferiados
      : weekday === "Sat"
        ? route.horariossabados
        : route.horariosdiasuteis;
  return table
    .split(",")
    .map((t) => {
      const [h, m] = t.split(":").map(Number);
      return { time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, at: h! * 60 + m! };
    })
    .filter((d) => d.at >= minutes)
    .slice(0, MAX_ARRIVALS)
    .map((d) => ({ source: "schedule" as const, etaMin: d.at - minutes, time: d.time }));
}

export function findNearbyStops(lines: PortalLine[], pos: Point, now = new Date()): NearbyStop[] {
  const result: NearbyStop[] = [];
  for (const line of lines) {
    const otherEnd = line.rotas.find((r) => r.sentido === "ida")?.destino ?? "";
    for (const route of line.rotas) {
      let stop = route.pontos[0];
      let distanceM = Infinity;
      for (const s of route.pontos) {
        const d = haversine(pos, [s.latitude, s.longitude]);
        if (d < distanceM) {
          distanceM = d;
          stop = s;
        }
      }
      if (!stop || distanceM > RADIUS_M) continue;

      // "ida" runs from the terminal, so it only matters at its first stop;
      // elsewhere we want "volta". The last stop of "volta" is where buses end their trip.
      const terminal = route.pontos[0] === stop;
      const last = route.pontos.at(-1) === stop;
      if (route.sentido === "ida" ? !terminal : last) continue;

      let arrivals: Arrival[] = [];
      if (!terminal) {
        const path = decodePolyline(route.encode);
        const stopAt = alongRoute(path, [stop.latitude, stop.longitude]);
        const kmh = line.velocidadeMedia > 0 ? line.velocidadeMedia : DEFAULT_SPEED_KMH;
        arrivals = line.veiculos
          .filter(
            (v) =>
              v.sentidoLinha === route.sentido &&
              v.dentroRota &&
              now.getTime() - v.dataUltimaTransmissao <= STALE_MS,
          )
          .map((v) => ({ v, left: stopAt - alongRoute(path, [v.latitude, v.longitude]) }))
          .filter(({ left }) => left >= 0)
          .map(({ v, left }) => ({
            source: "live" as const,
            etaMin: Math.round(left / ((kmh * 1000) / 60)),
            vehicle: v.prefixo,
            lat: v.latitude,
            lng: v.longitude,
          }))
          .sort((a, b) => a.etaMin - b.etaMin)
          .slice(0, MAX_ARRIVALS);
      }
      if (arrivals.length === 0) arrivals = nextDepartures(route, now);

      result.push({
        line: line.codigo,
        direction: route.sentido,
        destination: route.destino,
        otherEnd,
        address: stop.endereco,
        lat: stop.latitude,
        lng: stop.longitude,
        path: route.encode,
        distanceM: Math.round(distanceM),
        terminal,
        arrivals,
      });
    }
  }
  const preferred = result.filter(
    (s) => haversine([s.lat, s.lng], [PREFERRED_STOP.lat, PREFERRED_STOP.lng]) <= PREFERRED_STOP.radiusM,
  );
  return (preferred.length > 0 ? preferred : result).sort((a, b) => a.distanceM - b.distanceM);
}
