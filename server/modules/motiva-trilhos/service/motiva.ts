import safeEnvGet from "@server/safeEnvGet";

import { APIM_HOST, type CommuteLeg, type NextTrainEntry } from "../model";

const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { at: number; entries: NextTrainEntry[] }>();

export async function fetchNextTrain(leg: Pick<CommuteLeg, "concessionaire" | "track" | "station">) {
  const key = `${leg.concessionaire}/${leg.track}/${leg.station}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.entries;

  const res = await fetch(
    `${APIM_HOST}/int/ccr/next-train/concessionaire/${leg.concessionaire}/track/${leg.track}/departure/${leg.station}`,
    { headers: { "apim-api-key": safeEnvGet("MOTIVA_API_KEY") }, signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) throw new Error(`Motiva next-train ${key} responded ${res.status}`);
  const entries = ((await res.json()) as { Data: NextTrainEntry[] }).Data;
  cache.set(key, { at: Date.now(), entries });
  return entries;
}
