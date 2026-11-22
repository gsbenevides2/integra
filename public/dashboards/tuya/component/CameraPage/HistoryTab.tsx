import React, { useEffect, useMemo, useState } from "react";

import { PlayCircleIcon } from "@heroicons/react/24/outline";

import { SpeedVideo } from "./SpeedVideo";
import {
  MOTION_SCALE,
  type MotionBucket,
  type ReviewSegment,
  Timeline,
} from "./Timeline";

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

/**
 * Length of each clip played. Frigate streams clip.mp4 without Range support,
 * so the browser can't seek inside it: every seek loads a new clip starting at
 * the chosen instant, and short clips start fast and chain on `ended`.
 */
const CLIP_SECONDS = 600;

const unix = (date: Date) => Math.floor(date.getTime() / 1000);

/** A local day as unix seconds; today ends now. */
function dayRange(day: string) {
  const start = new Date(`${day}T00:00:00`);
  const next = new Date(start);
  next.setDate(start.getDate() + 1);
  return { start: unix(start), end: Math.min(unix(next), unix(new Date())) };
}

/** Start of the local hour holding `time`, the unit recordings are listed in. */
function hourOf(time: number) {
  const date = new Date(time * 1000);
  date.setMinutes(0, 0, 0);
  return unix(date);
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

/** A JSON list, or an empty one when the request or the body fails. */
const getJson = <T,>(url: string) =>
  fetch(url)
    .then((res) => (res.ok ? (res.json() as Promise<T[]>) : []))
    .catch(() => [] as T[]);

export function HistoryTab({ name }: { name: string }) {
  const base = `/api/frigate/cameras/${name}`;
  const [days, setDays] = useState<DaySummary[] | null>(null);
  const [day, setDay] = useState("");
  const [motion, setMotion] = useState<MotionBucket[]>([]);
  const [reviews, setReviews] = useState<ReviewSegment[]>([]);
  /** Start of the clip loaded, in unix seconds. */
  const [clip, setClip] = useState<number | null>(null);
  /** The instant on the playhead. */
  const [time, setTime] = useState<number | null>(null);
  const [events, setEvents] = useState<FrigateEvent[]>([]);

  useEffect(() => {
    // Frigate buckets days and hours in UTC unless told the viewer's timezone.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Switching cameras keeps this component: drop the previous camera's days
    // and any late answer for it.
    let live = true;
    setDays(null);
    getJson<DaySummary>(`${base}/recordings/summary?timezone=${timezone}`).then(
      (summary) => {
        if (!live) return;
        setDays(summary);
        setDay(summary[0]?.day ?? "");
      },
    );
    return () => {
      live = false;
    };
  }, [base]);

  // Frozen when the day is picked: today's end would otherwise move every render.
  const range = useMemo(() => (day ? dayRange(day) : null), [day]);
  useEffect(() => {
    setMotion([]);
    setReviews([]);
    if (!range) return;
    // A slow answer for the previous day must not land on the new one.
    let live = true;
    const span = `after=${range.start}&before=${range.end}`;
    getJson<MotionBucket>(`${base}/motion?${span}&scale=${MOTION_SCALE}`).then(
      (list) => live && setMotion(list),
    );
    getJson<ReviewSegment>(`${base}/review?${span}`).then(
      (list) => live && setReviews(list),
    );
    return () => {
      live = false;
    };
  }, [base, range]);

  const clipHour = clip === null ? null : hourOf(clip);
  useEffect(() => {
    setEvents([]);
    if (clipHour === null) return;
    let live = true;
    getJson<FrigateEvent>(
      `${base}/events?limit=100&after=${clipHour}&before=${clipHour + 3600}`,
    ).then((list) => live && setEvents([...list].reverse()));
    return () => {
      live = false;
    };
  }, [base, clipHour]);

  if (!days) return <p className="text-sm text-mist-400">Carregando...</p>;
  if (days.length === 0 || !range) {
    return <p className="text-sm text-mist-400">Sem gravações.</p>;
  }

  const recordedHours = (days.find((item) => item.day === day)?.hours ?? [])
    .map((item) => unix(new Date(`${day}T${item.hour}:00:00`)))
    .sort((a, b) => a - b);
  const recorded = new Set(recordedHours);

  const seek = (target: number) => {
    setTime(target);
    setClip(recorded.has(hourOf(target)) ? Math.floor(target) : null);
  };

  /** The clip after `from`, skipping hours without recordings. */
  const nextClip = (from: number) => {
    const next = from + CLIP_SECONDS;
    if (recorded.has(hourOf(next))) return next;
    return recordedHours.find((hour) => hour > from);
  };

  const pickDay = (next: string) => {
    setDay(next);
    setClip(null);
    setTime(null);
  };

  return (
    <div
      className="
        grid grid-cols-1 gap-4
        lg:h-[calc(100dvh-7.75rem)] lg:grid-cols-[minmax(0,1fr)_8rem]
      "
    >
      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="listbox"
            aria-label="Dia"
            className="flex min-w-0 stagger-in gap-2 overflow-x-auto pb-1"
          >
            {days.map((item) => (
              <button
                key={item.day}
                type="button"
                role="option"
                aria-selected={item.day === day}
                onClick={() => pickDay(item.day)}
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
          <p className="text-sm text-mist-300 tabular-nums">
            {time === null
              ? dayLabel(day)
              : `${dayLabel(day)}, ${new Date(time * 1000).toLocaleTimeString("pt-BR")}`}
          </p>
        </div>

        <div
          className="
            relative aspect-video w-full overflow-hidden rounded-lg bg-gray-800
            lg:aspect-auto lg:min-h-0 lg:flex-1
          "
        >
          {clip !== null ? (
            <SpeedVideo
              key={clip}
              src={`${base}/clip.mp4?start=${clip}&end=${clip + CLIP_SECONDS}`}
              controls
              autoPlay
              playsInline
              onTimeUpdate={(e) => setTime(clip + e.currentTarget.currentTime)}
              onEnded={() => {
                const next = nextClip(clip);
                if (next === undefined || next >= range.end) return;
                setTime(next);
                setClip(next);
              }}
              className="size-full animate-fade-up object-contain"
            />
          ) : (
            <div
              className="
                flex size-full flex-col items-center justify-center gap-2
                text-mist-500
              "
            >
              <PlayCircleIcon className="size-12" />
              <p className="text-sm">
                {time === null
                  ? "Escolha um momento na linha do tempo"
                  : "Sem gravação neste horário"}
              </p>
            </div>
          )}
        </div>

        {events.length > 0 && (
          <section className="flex shrink-0 flex-col gap-2">
            <h2 className="text-xs text-mist-400">Eventos nesta hora</h2>
            <div className="
              flex stagger-in scrollbar-thin
              [scrollbar-color:var(--color-gray-700)_transparent] gap-2
              overflow-x-auto pb-1
            ">
              {events.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => seek(event.start_time)}
                  // Clips start at whole seconds, so this is the event playing.
                  aria-current={
                    Math.floor(event.start_time) === clip ? true : undefined
                  }
                  className="
                    flex shrink-0 cursor-pointer flex-col gap-1 rounded-lg
                    bg-gray-800 p-1.5 text-left text-xs
                    hover:bg-gray-700
                    aria-current:bg-blue-950 aria-current:ring-1
                    aria-current:ring-blue-500
                  "
                >
                  <img
                    src={`${base}/events/${event.id}/thumbnail.jpg`}
                    alt={event.label}
                    loading="lazy"
                    className="aspect-video w-28 rounded-sm object-cover"
                  />
                  <span>
                    {event.label}{" "}
                    <span className="text-mist-400">
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

      <div
        className="
          h-72 min-h-0
          lg:h-full
        "
      >
        <Timeline
          key={day}
          start={range.start}
          end={range.end}
          motion={motion}
          reviews={reviews}
          recorded={recorded}
          current={time}
          onSeek={seek}
        />
      </div>
    </div>
  );
}
