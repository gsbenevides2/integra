/* eslint-disable @typescript-eslint/no-explicit-any -- Google Maps is loaded at runtime, without typings */
import React, { useEffect, useRef, useState } from "react";

import type { NearbyStop } from "@server/modules/nearby-bus/model";

import { etaLabel, lineColor } from "./format";

declare const google: any;

let loading: Promise<void> | undefined;

function loadGoogleMaps(apiKey: string) {
  if (typeof google !== "undefined" && google.maps) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = undefined;
      reject(new Error("Failed to load Google Maps"));
    };
    document.head.append(script);
  });
  return loading;
}

// The integra palette (tailwind gray-*) applied to Google's base map.
const MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#101828" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#99a1af" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#030712" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#364153" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#364153" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1e2939" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#4a5565" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#99a1af" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#030712" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#6a7282" }] },
];

const RING = "#030712";

const circle = (scale: number, fill: string, stroke: string, weight: number, opacity = 1) => ({
  path: google.maps.SymbolPath.CIRCLE,
  scale,
  fillColor: fill,
  fillOpacity: opacity,
  strokeColor: stroke,
  strokeWeight: weight,
});

/** A speech-bubble marker, e.g. "381 · 4 min". */
function pill(text: string, color: string) {
  const w = Math.round(text.length * 7.4 + 22);
  const h = 26;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + 8}">` +
    `<path d="M${w / 2 - 6} ${h - 1}l6 8 6-8z" fill="${color}"/>` +
    `<rect width="${w}" height="${h}" rx="13" fill="${color}" stroke="${RING}" stroke-width="2"/>` +
    `<text x="${w / 2}" y="17.5" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="${RING}">${text}</text></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(w, h + 8),
    anchor: new google.maps.Point(w / 2, h + 8),
  };
}

interface Props {
  apiKey: string;
  position: { lat: number; lng: number };
  stops: NearbyStop[];
  /** The live bus closest to arriving, highlighted and framed on the map. */
  nearest?: { line: string; vehicle: string; etaMin: number };
}

export function NearbyBusMap({ apiKey, position, stops, nearest }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<any>(undefined);
  const overlays = useRef<any[]>([]);
  const framedOn = useRef<string>(undefined);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadGoogleMaps(apiKey).then(() => setReady(true), () => setFailed(true));
  }, [apiKey]);

  useEffect(() => {
    if (!ready) return;
    map.current ??= new google.maps.Map(container.current, {
      center: position,
      zoom: 17,
      maxZoom: 18,
      styles: MAP_STYLES,
      backgroundColor: "#101828",
      disableDefaultUI: true,
      zoomControl: true,
      clickableIcons: false,
      gestureHandling: "greedy",
    });
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = [];
    const bounds = new google.maps.LatLngBounds(position);
    const add = (o: any) => overlays.current.push(o);
    const marker = (options: object) => add(new google.maps.Marker({ map: map.current, ...options }));

    for (const s of stops) {
      const color = lineColor(s.line);
      add(
        new google.maps.Polyline({
          map: map.current,
          path: google.maps.geometry.encoding.decodePath(s.path),
          strokeColor: color,
          strokeOpacity: 0.55,
          strokeWeight: 4,
        }),
      );
      marker({ position: s, title: s.address, icon: circle(6, "#ffffff", color, 3) });
      bounds.extend(s);
      for (const a of s.arrivals) {
        if (a.lat === undefined || a.lng === undefined) continue;
        const at = { lat: a.lat, lng: a.lng };
        if (nearest?.line === s.line && nearest.vehicle === a.vehicle) {
          marker({
            position: at,
            zIndex: 10,
            title: `${s.line} · ${a.vehicle}`,
            icon: pill(`${s.line} · ${etaLabel(a.etaMin)}`, color),
          });
          bounds.extend(at);
        } else {
          marker({ position: at, title: `${s.line} · ${a.vehicle}`, icon: circle(7, color, RING, 2) });
        }
      }
    }
    marker({ position, title: "Você", zIndex: 20, clickable: false, icon: circle(7, "#2b7fff", "#ffffff", 2) });
    marker({ position, zIndex: 19, clickable: false, icon: circle(18, "#2b7fff", "#2b7fff", 0, 0.2) });

    // Frame user + stop + nearest bus once, and again only when the nearest bus changes,
    // so the 15 s polling never undoes the user's panning.
    const key = nearest ? `${nearest.line}/${nearest.vehicle}` : "";
    if (framedOn.current !== key) {
      framedOn.current = key;
      map.current.fitBounds(bounds, 64);
    }
  }, [ready, position, stops, nearest]);

  if (failed) return <p className="text-sm text-mist-400">Não foi possível carregar o mapa.</p>;
  return <div ref={container} className="
    size-full min-h-64 overflow-hidden rounded-md bg-gray-900
  " />;
}
