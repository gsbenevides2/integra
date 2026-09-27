interface RpcConfig {
  url: string;
  method: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  data?: unknown;
}

async function request(config: RpcConfig): Promise<{ data: unknown }> {
  const query =
    config.params && Object.keys(config.params).length > 0
      ? `?${new URLSearchParams(config.params).toString()}`
      : "";
  const canHaveBody = config.method !== "GET" && config.method !== "HEAD";
  const response = await fetch(`${config.url}${query}`, {
    method: config.method,
    headers: config.headers,
    body:
      canHaveBody && config.data !== undefined
        ? JSON.stringify(config.data)
        : undefined,
  });
  return { data: await response.json() };
}

/**
 * Axios-shaped adapter over the global `fetch` (already OTel-traced by instrumentFetch.ts),
 * called both as `rpc(config)` and `rpc.request(config)` by TuyaContext. Keeps Tuya's real
 * HMAC signing/token-refresh logic while every Tuya REST call rides the app's existing
 * tracing instead of a second, untraced HTTP client.
 */
export const fetchRpc = Object.assign(request, { request });
