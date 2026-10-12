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
