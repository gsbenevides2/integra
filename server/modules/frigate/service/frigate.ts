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
