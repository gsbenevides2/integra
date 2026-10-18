import type { InstrumentedInit } from "@server/instrumentation/instrumentFetch";
import safeEnvGet from "@server/safeEnvGet";
import { loginInAuthentik } from "@server/shared/authentik";

export async function frigateFetch(path: string, init: InstrumentedInit = {}) {
  const { access_token } = await loginInAuthentik(
    safeEnvGet("FRIGATE_CLIENT_ID"),
  );
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${access_token}`);
  return fetch(new URL(path, safeEnvGet("FRIGATE_ENDPOINT")), {
    ...init,
    headers,
  });
}

/** Names of the enabled cameras in Frigate's config. */
export async function listEnabledCameras(): Promise<string[]> {
  const res = await frigateFetch("/api/config");
  if (!res.ok) throw new Error("Frigate indisponível");
  const config = (await res.json()) as {
    cameras: Record<string, { enabled?: boolean }>;
  };
  return Object.entries(config.cameras)
    .filter(([, camera]) => camera.enabled !== false)
    .map(([name]) => name);
}

/** Height of the snapshots taken for the assistant (enough to read a scene). */
export const SNAPSHOT_HEIGHT = 720;

/** The camera's latest frame as a JPEG. */
export async function cameraSnapshot(name: string): Promise<Uint8Array> {
  const res = await frigateFetch(
    `/api/${encodeURIComponent(name)}/latest.jpg?h=${SNAPSHOT_HEIGHT}`,
  );
  if (!res.ok) throw new Error(`Câmera ${name} indisponível`);
  return new Uint8Array(await res.arrayBuffer());
}

export const PTZ_COMMANDS = [
  "MOVE_LEFT",
  "MOVE_RIGHT",
  "MOVE_UP",
  "MOVE_DOWN",
  "ZOOM_IN",
  "ZOOM_OUT",
  "STOP",
] as const;

/** Frigate feature name -> its key in the live `camera_activity` config. */
export const CAMERA_FEATURES = {
  detect: "detect",
  recordings: "record",
  snapshots: "snapshots",
  audio: "audio",
  ptz_autotracker: "autotracking",
} as const;

async function openFrigateSocket(): Promise<WebSocket> {
  const { access_token } = await loginInAuthentik(
    safeEnvGet("FRIGATE_CLIENT_ID"),
  );
  const url = new URL("/ws", safeEnvGet("FRIGATE_ENDPOINT"));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  // Bun's WebSocket accepts request headers; the DOM typings don't know it.
  const ws = new WebSocket(url, {
    headers: { Authorization: `Bearer ${access_token}` },
  } as never);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("Frigate indisponível"));
  });
  return ws;
}

/** Sends a PTZ command (a MOVE_/ZOOM_ verb, STOP or `preset_<name>`). */
export async function sendPtz(name: string, command: string): Promise<void> {
  const ws = await openFrigateSocket();
  ws.send(JSON.stringify({ topic: `${name}/ptz`, payload: command }));
  ws.close();
}

/**
 * The camera's live feature switches (detect, record, audio...), which only
 * the websocket exposes: /api/config holds the static config, not the runtime
 * state. Null when the camera is not in the first `camera_activity` message.
 */
export async function cameraLiveConfig(
  name: string,
): Promise<Record<string, unknown> | null> {
  const ws = await openFrigateSocket();
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 5000);
      ws.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as {
          topic: string;
          payload: string | Record<string, { config?: object }>;
        };
        if (message.topic !== "camera_activity") return;
        clearTimeout(timer);
        const payload =
          typeof message.payload === "string"
            ? (JSON.parse(message.payload) as Record<string, { config?: object }>)
            : message.payload;
        resolve((payload[name]?.config as Record<string, unknown>) ?? null);
      };
      ws.send(JSON.stringify({ topic: "onConnect" }));
    });
  } finally {
    ws.close();
  }
}

export interface FrigateStats {
  cameras: Record<
    string,
    { fps: number; skippedFps: number; detectionFps: number; detecting: boolean }
  >;
  detector: { name: string; inferenceMs: number } | null;
  /** MB, of the recordings volume. */
  disk: { total: number; used: number; free: number } | null;
  /** First GPU Frigate reports, usage as "12.0%". */
  gpu: { name: string; usage: string; memory: string } | null;
  /** The volumes besides recordings: ram (/dev/shm) and cache (/tmp/cache). */
  memory: { name: string; total: number; used: number }[];
  version: string;
  latestVersion: string;
  uptime: number;
}

/** A trimmed /api/stats: the raw one also lists every process command line. */
export async function frigateStats(): Promise<FrigateStats> {
  const res = await frigateFetch("/api/stats");
  if (!res.ok) throw new Error("Frigate indisponível");
  const raw = (await res.json()) as {
    cameras: Record<
      string,
      {
        camera_fps: number;
        skipped_fps: number;
        detection_fps: number;
        detection_enabled: boolean;
      }
    >;
    gpu_usages?: Record<string, { gpu: string; mem: string }>;
    detectors: Record<string, { inference_speed: number }>;
    service: {
      version: string;
      latest_version: string;
      uptime: number;
      storage: Record<string, { total: number; used: number; free: number }>;
    };
  };
  const [detector] = Object.entries(raw.detectors);
  const [gpu] = Object.entries(raw.gpu_usages ?? {});
  const disk = raw.service.storage["/media/frigate/recordings"];
  return {
    cameras: Object.fromEntries(
      Object.entries(raw.cameras).map(([name, c]) => [
        name,
        {
          fps: c.camera_fps,
          skippedFps: c.skipped_fps,
          detectionFps: c.detection_fps,
          detecting: c.detection_enabled,
        },
      ]),
    ),
    gpu: gpu ? { name: gpu[0], usage: gpu[1].gpu, memory: gpu[1].mem } : null,
    memory: [
      ["Memória compartilhada", "/dev/shm"],
      ["Cache", "/tmp/cache"],
    ].flatMap(([name, path]) => {
      const volume = raw.service.storage[path];
      return volume ? [{ name, total: volume.total, used: volume.used }] : [];
    }),
    detector: detector
      ? { name: detector[0], inferenceMs: detector[1].inference_speed }
      : null,
    disk: disk
      ? { total: disk.total, used: disk.used, free: disk.free }
      : null,
    version: raw.service.version,
    latestVersion: raw.service.latest_version,
    uptime: raw.service.uptime,
  };
}
