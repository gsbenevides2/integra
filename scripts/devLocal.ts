/**
 * Dev-only DNS override for `*.infra.gui.dev.br`.
 *
 * Bun has no DNS override of its own and its native clients (`Bun.s3`,
 * `WebSocket`) can't be told "dial this IP but keep the hostname". So
 * `bun run dev:local` loads this module with `--preload` (see package.json) and
 * it starts a tiny in-process CONNECT proxy: requests to a host in
 * LOCAL_DOMAIN are tunneled to LOCAL_IP with the original hostname, which keeps
 * `Host`, TLS SNI and certificate validation intact.
 *
 * How each client is wired:
 * - `fetch` and `WebSocket` get an explicit `proxy` for those hosts;
 * - `Bun.s3` (and anything else) picks the proxy up from `HTTP(S)_PROXY`.
 *
 * Only HTTP(S)/WS goes through it. Raw TCP clients (Postgres, Redis, SSH) must
 * point at the IP directly in `.env`.
 */

export const LOCAL_IP = "192.168.0.3";
export const LOCAL_DOMAIN = "infra.gui.dev.br";

const HEADER_END = "\r\n\r\n";
const CONNECT_METHOD = "CONNECT";
const ESTABLISHED = "HTTP/1.1 200 Connection Established\r\n\r\n";
const BAD_REQUEST = "HTTP/1.1 400 Bad Request\r\n\r\n";
const BAD_GATEWAY = "HTTP/1.1 502 Bad Gateway\r\n\r\n";
const ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "http_proxy",
  "https_proxy",
] as const;

/** Bun's fetch/WebSocket extensions we forward as-is. */
interface BunOptions {
  tls?: Record<string, unknown>;
  proxy?: unknown;
}

interface WebSocketOptions extends BunOptions {
  headers?: HeadersInit;
  protocols?: string | string[];
}

export interface InstallOptions {
  /** LAN address of the reverse proxy. Defaults to LOCAL_IP. */
  ip?: string;
}

export interface DevLocalHandle {
  /** URL of the in-process proxy (`http://127.0.0.1:<port>`). */
  proxyUrl: string;
  /** Restores globals/env and stops the proxy. */
  uninstall(): void;
}

interface ProxySocketData {
  chunks: Uint8Array[];
  upstream?: Awaited<ReturnType<typeof Bun.connect>>;
}

export interface LocalProxy {
  url: string;
  port: number;
  stop(): void;
}

/** True for `infra.gui.dev.br` itself and any of its subdomains. */
export function isLocalHost(hostname: string): boolean {
  return hostname === LOCAL_DOMAIN || hostname.endsWith(`.${LOCAL_DOMAIN}`);
}

/** Splits `host:port`, `[::1]:port` or a bare host into hostname + port. */
function parseAuthority(
  authority: string,
  fallbackPort: number,
): { hostname: string; port: number } {
  const separator = authority.lastIndexOf(":");
  if (separator === -1) return { hostname: authority, port: fallbackPort };
  return {
    hostname: authority
      .slice(0, separator)
      .replace(/^\[/, "")
      .replace(/\]$/, ""),
    port: Number(authority.slice(separator + 1)) || fallbackPort,
  };
}

/**
 * Starts the local CONNECT proxy. `*.LOCAL_DOMAIN` hosts are dialed at `ip`;
 * everything else is forwarded to wherever the name resolves, so the proxy is
 * safe to leave in `HTTP(S)_PROXY` for the whole dev process.
 */
export function createLocalProxy({
  ip = LOCAL_IP,
  hostname = "127.0.0.1",
}: { ip?: string; hostname?: string } = {}): LocalProxy {
  const listener = Bun.listen<ProxySocketData>({
    hostname,
    port: 0,
    socket: {
      open(socket) {
        socket.data = { chunks: [] };
      },
      data(socket, chunk) {
        const upstream = socket.data.upstream;
        if (upstream) {
          upstream.write(chunk);
          return;
        }
        socket.data.chunks.push(chunk);
        const buffer = Buffer.concat(socket.data.chunks);
        const headerEnd = buffer.indexOf(HEADER_END);
        if (headerEnd === -1) return;

        const head = buffer.subarray(0, headerEnd).toString("latin1");
        const lineEnd = head.indexOf("\r\n");
        // Only the first line: header values contain spaces too.
        const [method, target, version = "HTTP/1.1"] = (
          lineEnd === -1 ? head : head.slice(0, lineEnd)
        ).split(" ");
        const headers = lineEnd === -1 ? "" : head.slice(lineEnd + 2);
        const rest = buffer.subarray(headerEnd + HEADER_END.length);
        if (!method || !target) {
          socket.end(BAD_REQUEST);
          return;
        }

        const isConnect = method === CONNECT_METHOD;
        let destination: { hostname: string; port: number };
        let payload: Uint8Array;
        if (isConnect) {
          destination = parseAuthority(target, 443);
          payload = rest;
        } else {
          let url: URL;
          try {
            url = new URL(target);
          } catch {
            socket.end(BAD_REQUEST);
            return;
          }
          destination = {
            hostname: url.hostname,
            port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
          };
          // Absolute form → origin form: the target only wants the path.
          const requestLine = `${method} ${url.pathname}${url.search} ${version}\r\n`;
          payload = Buffer.concat([
            Buffer.from(requestLine + headers + HEADER_END, "latin1"),
            rest,
          ]);
        }

        const upstreamHost = isLocalHost(destination.hostname)
          ? ip
          : destination.hostname;
        Bun.connect({
          hostname: upstreamHost,
          port: destination.port,
          socket: {
            open() {},
            data(upstream, data) {
              socket.write(data);
            },
            close() {
              socket.end();
            },
            connectError() {
              socket.end(BAD_GATEWAY);
            },
          },
        })
          .then((upstream) => {
            socket.data.upstream = upstream;
            socket.data.chunks = [];
            if (isConnect) {
              socket.write(ESTABLISHED);
              if (payload.length) upstream.write(payload);
              return;
            }
            upstream.write(payload);
          })
          .catch(() => socket.end(BAD_GATEWAY));
      },
      close(socket) {
        socket.data.upstream?.end();
      },
    },
  });

  const url = `http://${hostname}:${listener.port}`;
  return { url, port: listener.port, stop: () => listener.stop(true) };
}

/**
 * Patches `fetch` and `WebSocket`, sets `HTTP(S)_PROXY` and starts the proxy, so
 * the whole process resolves LOCAL_DOMAIN to the LAN IP. The returned
 * `uninstall()` is used by tests; the preload never calls it.
 */
export function installDevLocal(options: InstallOptions = {}): DevLocalHandle {
  const proxy = createLocalProxy({ ip: options.ip ?? LOCAL_IP });
  const originalFetch = globalThis.fetch;
  const OriginalWebSocket = globalThis.WebSocket;
  const previousEnv = ENV_KEYS.map((key) => [key, process.env[key]] as const);
  for (const key of ENV_KEYS) process.env[key] = proxy.url;

  const devFetch = (
    input: string | URL | Request,
    init?: RequestInit & BunOptions,
  ): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (!isLocalHost(url.hostname))
      return originalFetch(input, init as RequestInit);
    return originalFetch(input, {
      ...init,
      proxy: { url: proxy.url, respectNoProxy: false },
    } as RequestInit);
  };
  devFetch.preconnect = originalFetch.preconnect;

  const BaseWebSocket = OriginalWebSocket as unknown as new (
    ...args: unknown[]
  ) => WebSocket;

  class DevWebSocket extends BaseWebSocket {
    constructor(
      url: string | URL,
      protocolsOrOptions?: string | string[] | WebSocketOptions,
      options?: WebSocketOptions,
    ) {
      const target = new URL(String(url));
      if (!isLocalHost(target.hostname)) {
        if (options === undefined) super(url, protocolsOrOptions);
        else super(url, protocolsOrOptions, options);
        return;
      }

      let protocols: string | string[] | undefined;
      let init: WebSocketOptions = {};
      if (typeof protocolsOrOptions === "string")
        protocols = protocolsOrOptions;
      else if (Array.isArray(protocolsOrOptions))
        protocols = protocolsOrOptions;
      else init = protocolsOrOptions ?? {};

      // URL untouched: the proxy dials the LAN IP, the hostname keeps SNI.
      super(url, {
        ...init,
        protocols: protocols ?? init.protocols,
        proxy: proxy.url,
      });
    }
  }

  globalThis.fetch = devFetch as typeof fetch;
  globalThis.WebSocket = DevWebSocket as unknown as typeof WebSocket;

  return {
    proxyUrl: proxy.url,
    uninstall: () => {
      proxy.stop();
      for (const [key, value] of previousEnv) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      globalThis.fetch = originalFetch;
      globalThis.WebSocket = OriginalWebSocket;
    },
  };
}
