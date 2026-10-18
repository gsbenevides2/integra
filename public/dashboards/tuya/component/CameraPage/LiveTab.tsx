import React, { useEffect, useRef, useState } from "react";

import { Button } from "@public/components/Button";
import { useToast } from "@public/components/Toast";

import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
} from "@heroicons/react/24/outline";

import { getFrigateEdenClient } from "../../client";
import type { CameraState } from ".";
import { LiveVideo } from "./LiveVideo";

/** [command, icon, label, grid cell]: a D-pad on the left, zoom on the right. */
const PAD = [
  ["MOVE_UP", ArrowUpIcon, "Cima", "col-start-2 row-start-1"],
  ["MOVE_LEFT", ArrowLeftIcon, "Esquerda", "col-start-1 row-start-2"],
  ["MOVE_RIGHT", ArrowRightIcon, "Direita", "col-start-3 row-start-2"],
  ["MOVE_DOWN", ArrowDownIcon, "Baixo", "col-start-2 row-start-3"],
  ["ZOOM_IN", MagnifyingGlassPlusIcon, "Zoom +", "col-start-5 row-start-1"],
  ["ZOOM_OUT", MagnifyingGlassMinusIcon, "Zoom -", "col-start-5 row-start-3"],
] as const;

const LAST_EVENTS = 12;
const REFRESH_MS = 30_000;

interface FrigateEvent {
  id: string;
  label: string;
  start_time: number;
  has_clip: boolean;
}

export function LiveTab({
  name,
  ptz,
}: {
  name: string;
  ptz: CameraState["ptz"];
}) {
  const { showToast } = useToast();
  const [muted, setMuted] = useState(true);
  // Bumping it remounts the <video>, reconnecting at the live edge (no buffered delay).
  const [syncKey, setSyncKey] = useState(0);
  const live = useRef<HTMLVideoElement>(null);
  const [events, setEvents] = useState<FrigateEvent[]>([]);
  const [playing, setPlaying] = useState<FrigateEvent | null>(null);

  // React only writes `muted` as an attribute, so unmuting after mount never reached the element.
  useEffect(() => {
    if (live.current) live.current.muted = muted;
  }, [muted, playing, syncKey]);

  useEffect(() => {
    const load = () =>
      fetch(`/api/frigate/cameras/${name}/events?limit=${LAST_EVENTS}`)
        .then((res) => (res.ok ? (res.json() as Promise<FrigateEvent[]>) : []))
        .then(setEvents);
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, [name]);

  const send = (command: string) =>
    getFrigateEdenClient()
      .api.frigate.cameras({ name })
      .ptz.post({ command })
      .then(({ error }) => {
        if (error) showToast("Falha ao enviar comando PTZ", "error");
      });

  return (
    <div
      className="
      grid gap-4
      lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start
    "
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div
          className="
          relative aspect-video overflow-hidden rounded-lg bg-gray-800
        "
        >
          {playing ? (
            <video
              key={playing.id}
              src={`/api/frigate/cameras/${name}/events/${playing.id}/clip.mp4`}
              aria-label={`Evento ${playing.label}`}
              controls
              autoPlay
              playsInline
              className="size-full object-contain"
            />
          ) : (
            <LiveVideo
              key={syncKey}
              videoRef={live}
              src={`/api/frigate/cameras/${name}/stream?audio=1`}
              poster={`/api/frigate/cameras/${name}/latest.jpg`}
              aria-label={name}
              autoPlay
              muted
              playsInline
              className="size-full object-contain"
            />
          )}
          {playing ? (
            <button
              type="button"
              onClick={() => setPlaying(null)}
              className="
                absolute top-2 left-2 cursor-pointer rounded-full bg-mist-950/70
                px-3 py-1 text-xs
              "
            >
              Voltar ao vivo
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSyncKey((value) => value + 1)}
                aria-label="Ressincronizar"
                title="Ressincronizar (remove o atraso)"
                className="
                  absolute right-12 bottom-2 cursor-pointer rounded-full
                  bg-mist-950/70 p-2
                "
              >
                <ArrowPathIcon className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => setMuted((value) => !value)}
                aria-label={muted ? "Ativar áudio" : "Silenciar"}
                className="
                absolute right-2 bottom-2 cursor-pointer rounded-full
                bg-mist-950/70 p-2
              "
              >
                {muted ? (
                  <SpeakerXMarkIcon className="size-5" />
                ) : (
                  <SpeakerWaveIcon className="size-5" />
                )}
              </button>
            </>
          )}
        </div>
        {events.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-mist-300">
              Últimos eventos
            </h2>
            <div className="flex stagger-in gap-2 overflow-x-auto pb-1">
              {events.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  disabled={!event.has_clip}
                  onClick={() => setPlaying(event)}
                  className={`
                    flex w-40 shrink-0 cursor-pointer flex-col overflow-hidden
                    rounded-lg bg-gray-800 text-left text-xs
                    disabled:cursor-not-allowed disabled:opacity-60
                    ${playing?.id === event.id ? "ring-2 ring-blue-500" : ""}
                  `}
                >
                  <img
                    src={`/api/frigate/cameras/${name}/events/${event.id}/thumbnail.jpg`}
                    alt={event.label}
                    loading="lazy"
                    className="aspect-video w-full object-cover"
                  />
                  <span className="p-2">
                    {event.label}
                    <br />
                    <span className="text-mist-400">
                      {new Date(event.start_time * 1000).toLocaleString(
                        "pt-BR",
                        {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      {ptz && (
        <section
          className="
          flex animate-fade-up flex-col gap-4 rounded-lg bg-gray-800 p-4
        "
        >
          <h2 className="text-sm font-semibold text-mist-300">Controle PTZ</h2>
          <div
            className="
              mx-auto grid grid-cols-[repeat(3,3.5rem)_1.5rem_3.5rem]
              grid-rows-3 gap-2
            "
          >
            <span
              aria-hidden
              className="
                col-start-2 row-start-2 m-auto size-2 rounded-full bg-gray-600
              "
            />
            {PAD.map(([command, Icon, label, cell]) => (
              <button
                key={command}
                type="button"
                aria-label={label}
                // Hold to move: the camera keeps going until STOP.
                onPointerDown={() => send(command)}
                onPointerUp={() => send("STOP")}
                onPointerLeave={(event) => {
                  if (event.buttons) send("STOP");
                }}
                onPointerCancel={() => send("STOP")}
                className={`
                  flex
                  ${cell}
                  h-14 cursor-pointer touch-none items-center justify-center
                  rounded-lg bg-gray-700 select-none
                  hover:bg-gray-600
                `}
              >
                <Icon className="size-6" />
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-mist-500">Segure para mover</p>
          {ptz.presets.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs text-mist-400">Posições salvas</h3>
              <div className="flex flex-wrap gap-2">
                {ptz.presets.map((preset) => (
                  <Button
                    key={preset}
                    variant="secondary"
                    className="border border-gray-600"
                    onClick={() => send(`preset_${preset}`)}
                  >
                    Preset {preset}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
