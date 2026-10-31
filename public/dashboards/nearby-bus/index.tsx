import React, { useCallback, useEffect, useState } from "react";

import type { NearbyStop } from "@server/modules/nearby-bus/model";
import {
  DashboardData,
  useGlobalDrawer,
} from "@public/components/GlobalDrawerContext";
import { IconButton } from "@public/components/IconButton";
import { useToast } from "@public/components/Toast";

import { Bars3Icon, MapPinIcon } from "@heroicons/react/24/outline";

import { getNearbyBusEdenClient } from "./client";
import { etaLabel, lineBranch, lineColor, placeName, streetName } from "./format";
import { NearbyBusMap } from "./NearbyBusMap";

const POLL_INTERVAL_MS = 15_000;

type Position = { lat: number; lng: number };
type Arrival = NearbyStop["arrivals"][number];

export function nearestBus(stops: NearbyStop[]) {
  let best: { line: string; vehicle: string; etaMin: number } | undefined;
  for (const s of stops) {
    for (const a of s.arrivals) {
      if (a.source === "live" && a.vehicle && (!best || a.etaMin < best.etaMin)) {
        best = { line: s.line, vehicle: a.vehicle, etaMin: a.etaMin };
      }
    }
  }
  return best;
}

function StopCard({ stop, isNearest }: { stop: NearbyStop; isNearest: boolean }) {
  const live = stop.arrivals.filter((a) => a.source === "live");
  const scheduled = stop.arrivals.filter((a) => a.source === "schedule");
  return (
    <div className="flex flex-col gap-3 rounded-md bg-gray-800 p-3 text-sm">
      <div className="flex items-center gap-2">
        <span
          className="rounded-md px-2 py-0.5 text-base font-bold text-gray-950"
          style={{ backgroundColor: lineColor(stop.line) }}
        >
          {stop.line}
        </span>
        <span
          className="rounded-full border px-2 py-0.5 text-xs"
          style={{ borderColor: lineColor(stop.line), color: lineColor(stop.line) }}
        >
          {lineBranch(stop.otherEnd)}
        </span>
        <p className="min-w-0 flex-1 truncate text-base">
          {stop.terminal ? "Saindo para " : "Sentido "}
          {placeName(stop.destination)}
        </p>
        {isNearest && (
          <span className="
            rounded-full bg-green-900 px-2 py-0.5 text-xs text-green-300
          ">
            Mais próximo
          </span>
        )}
      </div>
      <p className="text-xs text-mist-400">
        {streetName(stop.address)} · {stop.distanceM < 25 ? "você está no ponto" : `a ${stop.distanceM} m`}
      </p>

      {live.map((a: Arrival, i) => (
        <div key={a.vehicle} className="flex items-baseline gap-2">
          <span className="
            size-2 shrink-0 self-center rounded-full bg-green-500
          " />
          <span className={i === 0 ? "text-3xl font-semibold" : "text-lg"}>{etaLabel(a.etaMin)}</span>
          <span className="text-xs text-mist-400">ônibus {a.vehicle} · ao vivo</span>
        </div>
      ))}

      {scheduled.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-amber-400">
            {stop.terminal
              ? "Próximas saídas"
              : "Sem ônibus com sinal — próximas saídas da origem"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {scheduled.map((a) => (
              <span key={a.time} className="rounded-md bg-gray-700 px-2 py-1">
                <span className="font-semibold">{a.time}</span>
                <span className="text-xs text-mist-400"> · em {a.etaMin} min</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {stop.arrivals.length === 0 && <p className="text-mist-300">Sem mais horários hoje</p>}
    </div>
  );
}

const PLACES = {
  pena: { label: "Ponto da Pena", lat: -23.639141, lng: -46.322004 },
  terminal: { label: "Terminal Ribeirão Pires", lat: -23.712173, lng: -46.415905 },
} as const;
type Place = "auto" | keyof typeof PLACES;

export function NearbyBusDashboard() {
  const [place, setPlace] = useState<Place>("auto");
  const [gps, setGps] = useState<Position>();
  const [geoError, setGeoError] = useState<string>();
  const [stops, setStops] = useState<NearbyStop[]>();
  const [mapKey, setMapKey] = useState<string>();
  const { showToast } = useToast();
  const globalDrawer = useGlobalDrawer();

  useEffect(() => {
    getNearbyBusEdenClient()
      .api["nearby-bus"]["map-config"].get()
      .then(({ data }) => setMapKey(data?.apiKey ?? undefined));
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("Este navegador não suporta geolocalização.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGeoError(undefined);
        setGps({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      (e) =>
        setGeoError(
          e.code === e.PERMISSION_DENIED
            ? "Permita o acesso à localização para ver os ônibus perto de você."
            : "Não consegui obter sua localização agora, tentando de novo…",
        ),
      { enableHighAccuracy: false, maximumAge: 10_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const position = place === "auto" ? gps : PLACES[place];

  const fetchStops = useCallback(
    async (pos: Position) => {
      const { data, error } = await getNearbyBusEdenClient().api["nearby-bus"].get({ query: pos });
      if (error) showToast("Falha ao buscar ônibus", "error");
      else setStops(data.stops);
    },
    [showToast],
  );

  const lat = position?.lat;
  const lng = position?.lng;
  useEffect(() => {
    if (lat === undefined || lng === undefined) return;
    const pos = { lat, lng };
    fetchStops(pos);
    const interval = setInterval(() => fetchStops(pos), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [lat, lng, fetchStops]);

  const nearest = stops && nearestBus(stops);
  const showMap = Boolean(mapKey && position && stops && stops.length > 0);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <IconButton onClick={() => globalDrawer.setIsOpen(true)} aria-label="Abrir menu">
          <Bars3Icon className="size-5" />
        </IconButton>
        <h1 className="text-xl">Ônibus perto de mim</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["auto", "pena", "terminal"] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={place === id}
            onClick={() => {
              setPlace(id);
              setStops(undefined);
            }}
            className={`rounded-full border px-3 py-1 text-sm ${
              place === id ? "border-mist-200 bg-mist-700 text-white" : "border-mist-700 text-mist-300"
            }`}
          >
            {id === "auto" ? "Minha localização" : PLACES[id].label}
          </button>
        ))}
      </div>

      {geoError && place === "auto" ? (
        <p className="text-mist-200">{geoError}</p>
      ) : !stops ? (
        <p className="text-mist-400">Buscando sua localização…</p>
      ) : stops.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <MapPinIcon className="size-10 text-mist-500" />
          <p className="text-mist-200">Nenhum ponto das linhas 381 e 215 por perto</p>
        </div>
      ) : (
        <div
          className={`
            grid gap-3
            ${showMap ? `lg:grid-cols-[3fr_2fr]` : ""}
          `}
        >
          {showMap && (
            <div className="
              h-80
              lg:sticky lg:top-3 lg:h-[calc(100dvh-6rem)]
            ">
              <NearbyBusMap key={place} apiKey={mapKey!} position={position!} stops={stops} nearest={nearest} />
            </div>
          )}
          <div className="flex stagger-in flex-col gap-2">
            {stops.map((s) => (
              <StopCard
                key={`${s.line}-${s.direction}`}
                stop={s}
                isNearest={s.arrivals.some((a) => nearest !== undefined && a.vehicle === nearest.vehicle && s.line === nearest.line)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const nearbyBusDashboard: DashboardData = {
  id: "nearby-bus",
  content: NearbyBusDashboard,
  icon: MapPinIcon,
  name: "Ônibus perto",
};
