import { afterEach, expect, test } from "bun:test";

import {
  createLocalProxy,
  installDevLocal,
  isLocalHost,
  LOCAL_DOMAIN,
  LOCAL_IP,
  type LocalProxy,
} from "../../scripts/devLocal";

const realFetch = globalThis.fetch;
const RealWebSocket = globalThis.WebSocket;

class FakeWebSocket {
  readonly url: string | URL;
  readonly rest: unknown[];

  constructor(url: string | URL, ...rest: unknown[]) {
    this.url = url;
    this.rest = rest;
  }
}

interface FetchCall {
  input: unknown;
  init?: Record<string, unknown>;
}

function fakeFetch() {
  const calls: FetchCall[] = [];
  const fn = ((input: unknown, init?: Record<string, unknown>) => {
    calls.push({ input, init });
    return Promise.resolve(new Response("ok"));
  }) as unknown as typeof fetch;
  fn.preconnect = (() => Promise.resolve()) as typeof fetch.preconnect;
  globalThis.fetch = fn;
  return { calls, fn };
}

type FakeSocketConstructor = new (
  url: string,
  protocolsOrOptions?: string | string[] | Record<string, unknown>,
  options?: Record<string, unknown>,
) => FakeWebSocket;

/** Builds a socket through whatever installDevLocal left on the global. */
function newSocket(
  url: string,
  protocolsOrOptions?: string | string[] | Record<string, unknown>,
  options?: Record<string, unknown>,
): FakeWebSocket {
  const Constructor = globalThis.WebSocket as unknown as FakeSocketConstructor;
  return new Constructor(url, protocolsOrOptions, options);
}

function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (check()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error("timeout"));
      setTimeout(tick, 10);
    };
    tick();
  });
}

/** Loopback server that records what it receives and answers `pong`. */
function startTarget() {
  const received: string[] = [];
  const listener = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open() {},
      data(socket, chunk) {
        received.push(Buffer.from(chunk).toString("latin1"));
        socket.write("pong");
      },
      close() {},
    },
  });
  return { port: listener.port, received, stop: () => listener.stop(true) };
}

async function openClient(port: number) {
  const chunks: Buffer[] = [];
  const socket = await Bun.connect({
    hostname: "127.0.0.1",
    port,
    socket: {
      open() {},
      data(_socket, data) {
        chunks.push(Buffer.from(data));
      },
    },
  });
  return { socket, text: () => Buffer.concat(chunks).toString("latin1") };
}

const cleanups: Array<() => void> = [];

function track<T extends { stop(): void }>(resource: T): T {
  cleanups.push(() => resource.stop());
  return resource;
}

let installed: ReturnType<typeof installDevLocal> | undefined;

function trackInstall(): ReturnType<typeof installDevLocal> {
  installed = installDevLocal({ ip: "127.0.0.1" });
  return installed;
}

afterEach(() => {
  installed?.uninstall();
  installed = undefined;
  for (const cleanup of cleanups.splice(0)) cleanup();
  globalThis.fetch = realFetch;
  globalThis.WebSocket = RealWebSocket;
});

test("isLocalHost matches the domain and its subdomains only", () => {
  expect(isLocalHost(LOCAL_DOMAIN)).toBe(true);
  expect(isLocalHost(`gotify.${LOCAL_DOMAIN}`)).toBe(true);
  expect(isLocalHost(`a.b.${LOCAL_DOMAIN}`)).toBe(true);
  expect(isLocalHost("infra.gui.dev.br.evil.com")).toBe(false);
  expect(isLocalHost("notinfra.gui.dev.br")).toBe(false);
});

test("tunnels CONNECT to the LAN ip, buffering a split header", async () => {
  const target = track(startTarget());
  const proxy = track(createLocalProxy({ ip: "127.0.0.1" }));
  const client = await openClient(proxy.port);

  const request = `CONNECT ignored.${LOCAL_DOMAIN}:${target.port} HTTP/1.1`;
  client.socket.write(request);
  client.socket.write("\r\n\r\n");
  await waitFor(() => client.text().includes("200 Connection Established"));
  expect(target.received).toEqual([]);

  client.socket.write("ping");
  await waitFor(() => target.received.join("").includes("ping"));
  await waitFor(() => client.text().includes("pong"));
});

test("forwards bytes sent right after the CONNECT header", async () => {
  const target = track(startTarget());
  const proxy = track(createLocalProxy({ ip: "127.0.0.1" }));
  const client = await openClient(proxy.port);

  client.socket.write(
    `CONNECT a.${LOCAL_DOMAIN}:${target.port} HTTP/1.1\r\n\r\nearly`,
  );
  await waitFor(() => client.text().includes("200 Connection Established"));
  await waitFor(() => target.received.join("").includes("early"));
});

test("rewrites absolute-form requests to origin form", async () => {
  const target = track(startTarget());
  const proxy = track(createLocalProxy({ ip: "127.0.0.1" }));
  const client = await openClient(proxy.port);

  client.socket.write(
    `GET http://b.${LOCAL_DOMAIN}:${target.port}/a?b=1 HTTP/1.1\r\nHost: b.${LOCAL_DOMAIN}\r\nX-Test: 1\r\n\r\n`,
  );

  await waitFor(() => target.received.length > 0);
  expect(target.received.join("")).toBe(
    `GET /a?b=1 HTTP/1.1\r\nHost: b.${LOCAL_DOMAIN}\r\nX-Test: 1\r\n\r\n`,
  );
  await waitFor(() => client.text().includes("pong"));
});

test("uses the protocol default port when the URL omits it", async () => {
  const proxy = track(createLocalProxy({ ip: "127.0.0.1" }));
  const client = await openClient(proxy.port);

  // No port in the URL: defaults to 80, which is closed on the loopback.
  client.socket.write(
    `GET http://c.${LOCAL_DOMAIN}/ HTTP/1.1\r\nHost: c.${LOCAL_DOMAIN}\r\n\r\n`,
  );
  await waitFor(() => client.text().length > 0);
  expect(client.text()).toContain("HTTP/1.1");
});

test("rejects malformed requests", async () => {
  const proxy = track(createLocalProxy({ ip: "127.0.0.1" }));

  const empty = await openClient(proxy.port);
  empty.socket.write("\r\n\r\n");
  await waitFor(() => empty.text().includes("400 Bad Request"));

  const noUrl = await openClient(proxy.port);
  noUrl.socket.write("GET not-a-url HTTP/1.1\r\n\r\n");
  await waitFor(() => noUrl.text().includes("400 Bad Request"));
});

test("answers 502 when the destination is unreachable", async () => {
  const proxy = track(createLocalProxy({ ip: "127.0.0.1" }));
  const client = await openClient(proxy.port);

  client.socket.write(`CONNECT closed.${LOCAL_DOMAIN}:1 HTTP/1.1\r\n\r\n`);
  await waitFor(() => client.text().includes("502 Bad Gateway"));
});

test("parses CONNECT authorities with defaults, bad ports and IPv6", async () => {
  const proxy = track(createLocalProxy({ ip: "127.0.0.1" }));

  for (const authority of [
    `bare.${LOCAL_DOMAIN}`, // no port → 443
    `bad.${LOCAL_DOMAIN}:nope`, // unparsable port → 443
    "[::1]:1", // bracketed IPv6
  ]) {
    const client = await openClient(proxy.port);
    client.socket.write(`CONNECT ${authority} HTTP/1.1\r\n\r\n`);
    await waitFor(() => client.text().includes("502 Bad Gateway"));
  }
});

test("closes the upstream when the client hangs up", async () => {
  const target = track(startTarget());
  const proxy = track(createLocalProxy({ ip: "127.0.0.1" }));

  const idle = await openClient(proxy.port);
  idle.socket.end();

  const client = await openClient(proxy.port);
  client.socket.write(
    `CONNECT d.${LOCAL_DOMAIN}:${target.port} HTTP/1.1\r\n\r\n`,
  );
  await waitFor(() => client.text().includes("200 Connection Established"));
  client.socket.end();
  await Bun.sleep(50);
});

test("points fetch at the proxy only for local hosts", async () => {
  const { calls, fn } = fakeFetch();
  const { proxyUrl } = trackInstall();
  expect(globalThis.fetch.preconnect).toBe(fn.preconnect);
  expect(proxyUrl).toStartWith("http://127.0.0.1:");

  await fetch(`https://gotify.${LOCAL_DOMAIN}/message`);
  await fetch("https://api.github.com/rate_limit", { method: "GET" });

  expect(calls[0]!.init).toMatchObject({
    proxy: { url: proxyUrl, respectNoProxy: false },
  });
  expect(calls[1]!.init).toEqual({ method: "GET" });
});

test("points WebSocket at the proxy only for local hosts", () => {
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  const { proxyUrl } = trackInstall();

  const withOptions = newSocket(`wss://frigate.${LOCAL_DOMAIN}/ws?src=x`, {
    headers: { Authorization: "Bearer token" },
    protocols: ["mse"],
    tls: { ca: "cert" },
  });
  expect(withOptions.url).toBe(`wss://frigate.${LOCAL_DOMAIN}/ws?src=x`);
  expect(withOptions.rest[0]).toEqual({
    headers: { Authorization: "Bearer token" },
    protocols: ["mse"],
    tls: { ca: "cert" },
    proxy: proxyUrl,
  });

  const fromArray = newSocket(`wss://sso.${LOCAL_DOMAIN}/`, ["a", "b"]);
  expect(fromArray.rest[0]).toMatchObject({ protocols: ["a", "b"] });

  const fromString = newSocket(`wss://sso.${LOCAL_DOMAIN}/`, "a");
  expect(fromString.rest[0]).toMatchObject({ protocols: "a" });

  const bare = newSocket(`wss://sso.${LOCAL_DOMAIN}/`);
  expect(bare.rest[0]).toMatchObject({ protocols: undefined });

  expect(newSocket("wss://example.com/socket").rest).toEqual([]);
  expect(
    newSocket("wss://example.com/socket", { headers: { "x-test": "1" } }).rest,
  ).toEqual([{ headers: { "x-test": "1" } }]);
  expect(
    newSocket("wss://example.com/socket", "a", { headers: { "x-test": "1" } })
      .rest,
  ).toEqual(["a", { headers: { "x-test": "1" } }]);
});

test("sets HTTP(S)_PROXY and restores the previous values", () => {
  process.env.HTTPS_PROXY = "http://original:8080";
  const { proxyUrl, uninstall } = installDevLocal();

  for (const key of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "http_proxy",
    "https_proxy",
  ]) {
    expect(process.env[key]).toBe(proxyUrl);
  }

  uninstall();
  expect(process.env.HTTPS_PROXY).toBe("http://original:8080");
  expect(process.env.HTTP_PROXY).toBeUndefined();
  expect(globalThis.fetch).toBe(realFetch);
  expect(globalThis.WebSocket).toBe(RealWebSocket);
});

test("defaults to LOCAL_IP", () => {
  const proxy: LocalProxy = track(createLocalProxy());
  expect(proxy.url).toBe(`http://127.0.0.1:${proxy.port}`);
  expect(LOCAL_IP).toBe("192.168.0.3");
});
