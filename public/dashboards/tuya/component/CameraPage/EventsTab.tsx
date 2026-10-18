import React, { useEffect, useState } from "react";

import { Button } from "@public/components/Button";
import { Drawer } from "@public/components/Drawer";
import { SegmentedControl } from "@public/components/SegmentedControl";

import {
  ArrowDownTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";

import { SpeedVideo } from "./SpeedVideo";

const PAGE_SIZE = 30;

interface FrigateEvent {
  id: string;
  label: string;
  start_time: number;
  end_time: number | null;
  zones: string[];
  has_clip: boolean;
  has_snapshot: boolean;
}

const when = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString("pt-BR");

function Detail({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-mist-400">{term}</dt>
      <dd className="text-mist-100">{value}</dd>
    </div>
  );
}

export function EventsTab({ name }: { name: string }) {
  const [events, setEvents] = useState<FrigateEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"clip" | "snapshot">("clip");

  const load = (before?: number) => {
    setIsLoading(true);
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (label) query.set("label", label);
    if (before) query.set("before", String(before));
    return fetch(`/api/frigate/cameras/${name}/events?${query}`)
      .then((res) => (res.ok ? (res.json() as Promise<FrigateEvent[]>) : []))
      .then((page) => {
        setEvents((current) => (before ? [...current, ...page] : page));
        setHasMore(page.length === PAGE_SIZE);
      })
      .finally(() => setIsLoading(false));
  };

  // Labels come from what was already loaded, so the filter needs no extra call.
  const [labels, setLabels] = useState<string[]>([]);
  useEffect(() => {
    setLabels((current) => [
      ...new Set([...current, ...events.map((event) => event.label)]),
    ]);
  }, [events]);

  useEffect(() => {
    setSelectedId(null);
    load();
  }, [name, label]);

  const index = events.findIndex((event) => event.id === selectedId);
  const selected = events[index] ?? null;
  const open = (event: FrigateEvent) => {
    setSelectedId(event.id);
    setView(event.has_clip ? "clip" : "snapshot");
  };
  // The list is newest first, so "newer" is the previous index.
  const go = (step: number) => {
    const next = events[index + step];
    if (next) open(next);
  };

  const media = (event: FrigateEvent, asset: string) =>
    `/api/frigate/cameras/${name}/events/${event.id}/${asset}`;

  return (
    <div className="flex flex-col gap-3">
      {labels.length > 0 && (
        <select
          aria-label="Filtrar por tipo"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          className="w-fit rounded-md bg-gray-800 px-3 py-1.5 text-sm"
        >
          <option value="">Todos os tipos</option>
          {labels.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      )}
      {!isLoading && events.length === 0 && (
        <p className="text-sm text-mist-400">Nenhum evento.</p>
      )}
      <div className="
        grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2
      ">
        {events.map((event) => (
          <button
            key={event.id}
            type="button"
            onClick={() => open(event)}
            className={`
              flex cursor-pointer flex-col overflow-hidden rounded-lg
              bg-gray-800 text-left text-xs transition-transform
              hover:-translate-y-0.5
            `}
          >
            <img
              src={media(event, "thumbnail.jpg")}
              alt={event.label}
              loading="lazy"
              className="aspect-video w-full object-cover"
            />
            <span className="p-2">
              {event.label}
              <br />
              <span className="text-mist-400">
                {when(event.start_time)}
              </span>
            </span>
          </button>
        ))}
      </div>
      {hasMore && (
        <Button
          variant="secondary"
          isLoading={isLoading}
          onClick={() => load(events[events.length - 1]?.start_time)}
          className="self-center"
        >
          Carregar mais
        </Button>
      )}
      <Drawer
        isOpen={!!selected}
        onClose={() => setSelectedId(null)}
        enableSwipeClose
        size="large"
        title={selected ? `${selected.label} · ${when(selected.start_time)}` : ""}
      >
        {selected && (
          <div className="flex flex-col gap-4">
            <div className="relative aspect-video overflow-hidden rounded-lg bg-gray-800">
              {view === "clip" && selected.has_clip ? (
                <SpeedVideo
                  key={selected.id}
                  src={media(selected, "clip.mp4")}
                  controls
                  autoPlay
                  playsInline
                  className="size-full animate-fade-up object-contain"
                />
              ) : (
                <img
                  key={selected.id}
                  src={media(
                    selected,
                    selected.has_snapshot ? "snapshot.jpg" : "thumbnail.jpg",
                  )}
                  alt={selected.label}
                  className="size-full animate-fade-up object-contain"
                />
              )}
            </div>
            {selected.has_clip && selected.has_snapshot && (
              <SegmentedControl
                options={[
                  ["clip", "Clipe"],
                  ["snapshot", "Snapshot"],
                ]}
                value={view}
                onChange={setView}
                className="rounded-lg bg-gray-800 text-sm"
                pillClassName="rounded-md bg-gray-950"
                buttonClassName="px-3 py-1.5"
              />
            )}
            <dl className="
              grid grid-cols-2 gap-3 rounded-lg bg-gray-800 p-3 text-sm
            ">
              <Detail term="Tipo" value={selected.label} />
              <Detail term="Início" value={when(selected.start_time)} />
              <Detail
                term="Duração"
                value={
                  selected.end_time
                    ? `${Math.max(1, Math.round(selected.end_time - selected.start_time))} s`
                    : "Em andamento"
                }
              />
              <Detail
                term="Zonas"
                value={selected.zones.length ? selected.zones.join(", ") : "—"}
              />
            </dl>
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="secondary"
                disabled={index <= 0}
                onClick={() => go(-1)}
                aria-label="Evento mais recente"
              >
                <ChevronLeftIcon className="size-4" /> Mais recente
              </Button>
              {selected.has_clip && (
                <a
                  href={media(selected, "clip.mp4")}
                  download={`${name}-${selected.id}.mp4`}
                  aria-label="Baixar clipe"
                  className="
                    rounded-full p-2
                    hover:bg-gray-800
                  "
                >
                  <ArrowDownTrayIcon className="size-5" />
                </a>
              )}
              <Button
                variant="secondary"
                disabled={index >= events.length - 1}
                onClick={() => go(1)}
                aria-label="Evento mais antigo"
              >
                Mais antigo <ChevronRightIcon className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
