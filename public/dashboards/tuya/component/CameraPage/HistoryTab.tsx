import React, { useEffect, useRef, useState } from "react";

import { SpeedVideo } from "./SpeedVideo";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayCircleIcon,
} from "@heroicons/react/24/outline";

interface DaySummary {
  day: string;
  events: number;
  hours: { hour: string; events: number; motion: number; duration: number }[];
}

interface FrigateEvent {
  id: string;
  label: string;
  start_time: number;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));

/** The recording of one local hour, as unix seconds. */
function hourRange(day: string, hour: string) {
  const start = new Date(`${day}T${hour}:00:00`).getTime() / 1000;
  return { start, end: start + 3600 };
}

function dayLabel(day: string) {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  // "sv" formats as YYYY-MM-DD, the shape Frigate uses for days.
  if (day === today.toLocaleDateString("sv")) return "Hoje";
  if (day === yesterday.toLocaleDateString("sv")) return "Ontem";
  return new Date(`${day}T00:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

export function HistoryTab({ name }: { name: string }) {
  const [days, setDays] = useState<DaySummary[] | null>(null);
  const [day, setDay] = useState("");
  const [hour, setHour] = useState<string | null>(null);
  const [events, setEvents] = useState<FrigateEvent[]>([]);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Frigate buckets days and hours in UTC unless told the viewer's timezone.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetch(`/api/frigate/cameras/${name}/recordings/summary?timezone=${timezone}`)
      .then((res) => (res.ok ? (res.json() as Promise<DaySummary[]>) : []))
      .then((summary) => {
        setDays(summary);
        setDay(summary[0]?.day ?? "");
      });
  }, [name]);

  const range = hour ? hourRange(day, hour) : null;
  const start = range?.start;
  useEffect(() => {
    setEvents([]);
    if (!range) return;
    fetch(
      `/api/frigate/cameras/${name}/events?limit=100&after=${range.start}&before=${range.end}`,
    )
      .then((res) => (res.ok ? (res.json() as Promise<FrigateEvent[]>) : []))
      .then((list) => setEvents([...list].reverse()));
    // The range is derived from day and hour; start is its stable key.
  }, [name, start]);

  if (!days) return <p className="text-sm text-mist-400">Carregando...</p>;
  if (days.length === 0) {
    return <p className="text-sm text-mist-400">Sem gravações.</p>;
  }

  const current = days.find((item) => item.day === day);
  const byHour = new Map(current?.hours.map((item) => [item.hour, item]));
  const maxMotion = Math.max(1, ...(current?.hours.map((h) => h.motion) ?? []));
  const available = HOURS.filter((item) => byHour.has(item));
  const position = hour ? available.indexOf(hour) : -1;

  return (
    <div className="
      grid grid-cols-1 gap-4
      lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start
    ">
      <div className="flex flex-col gap-3">
        <div className="
          relative aspect-video overflow-hidden rounded-lg bg-gray-800
        ">
          {range ? (
            <SpeedVideo
              videoRef={video}
              key={`${day}${hour}`}
              src={`/api/frigate/cameras/${name}/clip.mp4?start=${range.start}&end=${range.end}`}
              controls
              autoPlay
              playsInline
              className="size-full animate-fade-up"
            />
          ) : (
            <div
              className="
                flex size-full flex-col items-center justify-center gap-2
                text-mist-500
              "
            >
              <PlayCircleIcon className="size-12" />
              <p className="text-sm">Escolha uma hora na linha do tempo</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Hora anterior"
            disabled={position <= 0}
            onClick={() => setHour(available[position - 1] ?? null)}
            className="
              cursor-pointer rounded-full p-2
              hover:bg-gray-800
              disabled:cursor-not-allowed disabled:opacity-30
            "
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <p className="text-sm text-mist-300">
            {hour ? `${dayLabel(day)}, ${hour}:00 – ${hour}:59` : dayLabel(day)}
          </p>
          <button
            type="button"
            aria-label="Próxima hora"
            disabled={position < 0 || position >= available.length - 1}
            onClick={() => setHour(available[position + 1] ?? null)}
            className="
              cursor-pointer rounded-full p-2
              hover:bg-gray-800
              disabled:cursor-not-allowed disabled:opacity-30
            "
          >
            <ChevronRightIcon className="size-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div
          role="listbox"
          aria-label="Dia"
          className="flex stagger-in gap-2 overflow-x-auto pb-1"
        >
          {days.map((item) => (
            <button
              key={item.day}
              type="button"
              role="option"
              aria-selected={item.day === day}
              onClick={() => {
                setDay(item.day);
                setHour(null);
              }}
              className={`
                shrink-0 cursor-pointer rounded-full border px-3 py-1 text-sm
                capitalize
                ${
                  item.day === day
                    ? "border-blue-500 bg-blue-950 text-white"
                    : `
                      border-gray-700 text-mist-300
                      hover:bg-gray-800
                    `
                }
              `}
            >
              {dayLabel(item.day)}
            </button>
          ))}
        </div>

        <section className="flex flex-col gap-2 rounded-lg bg-gray-800 p-3">
          <h2 className="text-xs text-mist-400">Linha do tempo (movimento)</h2>
          <div
            key={day}
            className="grid h-28 stagger-in grid-cols-24 gap-0.5"
          >
            {HOURS.map((item) => {
              const data = byHour.get(item);
              return (
                <button
                  key={item}
                  type="button"
                  aria-label={`${item}h`}
                  title={
                    data
                      ? `${item}h · ${data.events} evento(s)`
                      : `${item}h · sem gravação`
                  }
                  disabled={!data}
                  onClick={() => setHour(item)}
                  className={`
                    group relative flex cursor-pointer items-end rounded-sm
                    disabled:cursor-not-allowed
                    ${hour === item ? "bg-gray-600" : "hover:bg-gray-700"}
                  `}
                >
                  <span
                    aria-hidden
                    className={`
                      w-full rounded-sm
                      ${
                        hour === item
                          ? "bg-blue-400"
                          : data
                            ? "bg-blue-700"
                            : "bg-gray-700"
                      }
                    `}
                    style={{
                      height: data
                        ? `${Math.max(8, (data.motion / maxMotion) * 100)}%`
                        : "4%",
                    }}
                  />
                  {data && data.events > 0 && (
                    <span
                      aria-hidden
                      className="
                        absolute top-0.5 left-1/2 size-1.5 -translate-x-1/2
                        rounded-full bg-amber-400
                      "
                    />
                  )}
                </button>
              );
            })}
          </div>
          <div
            aria-hidden
            className="
              grid grid-cols-24 gap-0.5 text-center text-[10px] text-mist-500
            "
          >
            {HOURS.map((item) => (
              <span key={item}>{Number(item) % 6 === 0 ? item : ""}</span>
            ))}
          </div>
        </section>

        {hour && events.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-xs text-mist-400">Eventos nesta hora</h2>
            <div className="
              flex max-h-80 stagger-in flex-col gap-2 overflow-y-auto pr-1
            ">
              {events.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => {
                    if (video.current && range) {
                      video.current.currentTime = event.start_time - range.start;
                      void video.current.play?.();
                    }
                  }}
                  className="
                    flex cursor-pointer items-center gap-3 rounded-lg
                    bg-gray-800 p-2 text-left text-sm
                  "
                >
                  <img
                    src={`/api/frigate/cameras/${name}/events/${event.id}/thumbnail.jpg`}
                    alt={event.label}
                    loading="lazy"
                    className="aspect-video w-20 rounded-sm object-cover"
                  />
                  <span>
                    {event.label}
                    <br />
                    <span className="text-xs text-mist-400">
                      {new Date(event.start_time * 1000).toLocaleTimeString(
                        "pt-BR",
                      )}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
