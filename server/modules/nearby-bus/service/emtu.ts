import safeEnvGet from "@server/safeEnvGet";

import { NEARBY_BUS_LINES, type PortalLine } from "../model";

const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { at: number; line: PortalLine | null }>();

export async function fetchPortalLine(code: string): Promise<PortalLine | null> {
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.line;

  const res = await fetch(`https://bustime.noxxonsat.com.br/portal?linha=${code}`, {
    headers: { Authorization: safeEnvGet("EMTU_BUSTIME_AUTH") },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`EMTU portal ${code} responded ${res.status}`);
  // Without valid credentials the portal answers 200 with an empty body.
  const text = await res.text();
  if (!text) throw new Error(`EMTU portal ${code} returned an empty body`);
  const line = ((JSON.parse(text) as { linhas?: PortalLine[] }).linhas?.[0]) ?? null;
  cache.set(code, { at: Date.now(), line });
  return line;
}

export async function fetchAllLines() {
  const lines = await Promise.all(NEARBY_BUS_LINES.map(fetchPortalLine));
  return lines.filter((l): l is PortalLine => l !== null);
}
