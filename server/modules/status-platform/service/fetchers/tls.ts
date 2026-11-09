import type { FetcherOptions } from "./types";

/** RequestInit fragment that disables certificate validation when requested. */
export function tlsInit(options?: FetcherOptions): {
  tls?: { rejectUnauthorized: false };
} {
  return options?.ignoreSsl ? { tls: { rejectUnauthorized: false } } : {};
}
