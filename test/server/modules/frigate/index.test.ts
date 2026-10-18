import { afterAll, beforeAll, beforeEach, expect, mock, spyOn, test } from "bun:test";

import { installTestAuthz } from "../../../helpers/auth";

let app: { handle: (r: Request) => Promise<Response> };
let realAuth: any;
let restoreAuthz: () => void;
let fetchSpy: ReturnType<typeof spyOn>;
const env = { ...process.env };
const login = mock(async (_id: string) => ({ access_token: "TOK" }));

beforeAll(async () => {
  process.env.FRIGATE_CLIENT_ID = "cid";
  process.env.FRIGATE_ENDPOINT = "http://frigate.local/";
  realAuth = { ...(await import("@server/shared/authentik")) };
  mock.module("@server/shared/authentik", () => ({ ...realAuth, loginInAuthentik: login }));
  restoreAuthz = await installTestAuthz();
  ({ frigateRoutes: app } = (await import("@server/modules/frigate/index")) as any);
});
afterAll(() => {
  restoreAuthz();
  mock.module("@server/shared/authentik", () => realAuth);
  process.env = env;
});
beforeEach(() => {
  fetchSpy?.mockRestore();
});

const get = (p: string) => app.handle(new Request("http://localhost" + p));

test("cameras lists enabled only, sends bearer", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ cameras: { a: {}, b: { enabled: false }, c: { enabled: true } } }),
  );
  const res = await get("/api/frigate/cameras");
  expect(await res.json()).toEqual(["a", "c"]);
  const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
  expect(String(url)).toBe("http://frigate.local/api/config");
  expect((init.headers as Headers).get("Authorization")).toBe("Bearer TOK");
});

test("cameras 502 when upstream fails", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("x", { status: 500 }));
  expect((await get("/api/frigate/cameras")).status).toBe(502);
});

const fakeWs = (onOpen: (ws: any) => void) => {
  const urls: string[] = [];
  globalThis.WebSocket = class {
    onopen?: () => void;
    onmessage?: (e: { data: unknown }) => void;
    onclose?: () => void;
    onerror?: () => void;
    binaryType = "";
    sent: string[] = [];
    constructor(url: string) {
      urls.push(url);
      queueMicrotask(() => {
        this.onopen?.();
        onOpen(this);
      });
    }
    send(m: string) {
      this.sent.push(m);
    }
    close() {
      this.onclose?.();
    }
  } as any;
  return urls;
};

test("stream bridges the go2rtc MSE websocket to fMP4", async () => {
  const urls = fakeWs((ws) => {
    ws.onmessage({ data: JSON.stringify({ type: "mse", value: 'video/mp4; codecs="x"' }) });
    ws.onmessage({ data: new TextEncoder().encode("vid").buffer });
    ws.onmessage({ data: new TextEncoder().encode("eo").buffer });
    ws.close();
  });
  const res = await get("/api/frigate/cameras/cam-1/stream");
  expect(res.headers.get("content-type")).toBe('video/mp4; codecs="x"');
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(await res.text()).toBe("video");
  expect(urls[0]).toBe("ws://frigate.local/live/mse/api/ws?src=cam-1");
  globalThis.WebSocket = RealWebSocket;
});

test("cancelling the stream closes the websocket without throwing", async () => {
  let socket: any;
  fakeWs((ws) => {
    socket = ws;
    ws.close = mock(() => ws.onclose());
    ws.onmessage({ data: JSON.stringify({ type: "mse", value: "video/mp4" }) });
  });
  const res = await get("/api/frigate/cameras/cam-1/stream");
  await res.body!.cancel();
  expect(socket.close).toHaveBeenCalled();
  globalThis.WebSocket = RealWebSocket;
});

test("stream fails with 502 when the websocket errors", async () => {
  fakeWs((ws) => ws.onerror());
  expect((await get("/api/frigate/cameras/c/stream")).status).toBe(502);
  globalThis.WebSocket = RealWebSocket;
});

test("goToFrigate redirects; bad name rejected", async () => {
  const res = await get("/api/frigate/cameras/cam1/goToFrigate");
  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toBe("http://frigate.local/#cam1");
  expect((await get("/api/frigate/cameras/b@d/goToFrigate")).status).toBe(422);
});

test("cameraSnapshot fetches the latest frame at assistant size", async () => {
  const { cameraSnapshot, SNAPSHOT_HEIGHT } = await import("@server/modules/frigate/service/frigate");
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
  expect([...(await cameraSnapshot("frente porta"))]).toEqual([1, 2, 3]);
  const [url] = fetchSpy.mock.calls[0] as [URL];
  expect(String(url)).toBe(`http://frigate.local/api/frente%20porta/latest.jpg?h=${SNAPSHOT_HEIGHT}`);

  fetchSpy.mockResolvedValue(new Response("x", { status: 404 }));
  await expect(cameraSnapshot("frente")).rejects.toThrow("Câmera frente indisponível");
});

const sent: any[] = [];
let wsFails = false;
class FakeWebSocket {
  onopen: () => void = () => {};
  onerror: () => void = () => {};
  onmessage: (e: { data: string }) => void = () => {};
  constructor(public url: URL, public opts: any) {
    setTimeout(() => (wsFails ? this.onerror() : this.onopen()), 0);
  }
  send(data: string) {
    const message = JSON.parse(data);
    sent.push(message);
    if (message.topic === "onConnect") {
      const config = { detect: true, record: false, snapshots: false, audio: true, autotracking: false };
      this.onmessage({ data: JSON.stringify({ topic: "model_state", payload: "{}" }) });
      this.onmessage({ data: JSON.stringify({ topic: "camera_activity", payload: JSON.stringify({ cam: { config } }) }) });
    }
  }
  close() {}
}
const RealWebSocket = globalThis.WebSocket;
beforeEach(() => {
  sent.length = 0;
  wsFails = false;
  globalThis.WebSocket = FakeWebSocket as any;
});
afterAll(() => {
  globalThis.WebSocket = RealWebSocket;
});

const send = (method: string, p: string, body?: unknown) =>
  app.handle(
    new Request("http://localhost" + p, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const upstream = (i = 0) => String((fetchSpy.mock.calls[i] as any)[0]);

test("state combines ptz info and live feature switches", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ features: ["pt"], presets: ["1"] }));
  const res = await get("/api/frigate/cameras/cam/state");
  expect(await res.json()).toEqual({
    ptz: { features: ["pt"], presets: ["1"] },
    features: { detect: true, recordings: false, snapshots: false, audio: true, ptz_autotracker: false },
  });
  expect(upstream()).toBe("http://frigate.local/api/cam/ptz/info");
});

test("state without ptz or unknown camera, and 502 when frigate is down", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("x", { status: 404 }));
  const res = await get("/api/frigate/cameras/other/state");
  expect((await res.json()).ptz).toBeNull();
  wsFails = true;
  expect((await get("/api/frigate/cameras/cam/state")).status).toBe(502);
});

test("events forward filters; media is limited to the camera's own events", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (url: any) =>
    String(url).endsWith("/api/events/e1")
      ? Response.json({ camera: "cam" })
      : String(url).includes("/api/events/e2")
        ? Response.json({ camera: "elsewhere" })
        : new Response("[]", { headers: { "content-type": "application/json" } })) as any);
  expect(await (await get("/api/frigate/cameras/cam/events?label=person&before=5&after=1&limit=10")).json()).toEqual([]);
  expect(upstream()).toBe("http://frigate.local/api/events?cameras=cam&limit=10&labels=person&before=5&after=1");
  expect((await get("/api/frigate/cameras/cam/events?limit=1000")).status).toBe(422);

  expect((await get("/api/frigate/cameras/cam/events/e1/thumbnail.jpg")).status).toBe(200);
  expect((await get("/api/frigate/cameras/cam/events/e2/clip.mp4")).status).toBe(404);
  expect((await get("/api/frigate/cameras/cam/events/e1/other.exe")).status).toBe(422);
});

test("event media: missing event is 404, frigate down is 502", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("x", { status: 404 }));
  expect((await get("/api/frigate/cameras/cam/events/e1/clip.mp4")).status).toBe(404);
  fetchSpy.mockRejectedValue(new Error("down"));
  expect((await get("/api/frigate/cameras/cam/events/e1/clip.mp4")).status).toBe(502);
  expect((await get("/api/frigate/cameras/cam/events")).status).toBe(502);
});

test("recordings, clip and latest frame proxy with Range and 404/502 mapping", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("part", { status: 206, headers: { "content-type": "video/mp4", "content-range": "bytes 0-3/9" } }),
  );
  const res = await app.handle(
    new Request("http://localhost/api/frigate/cameras/cam/clip.mp4?start=10&end=20", { headers: { range: "bytes=0-3" } }),
  );
  expect(res.status).toBe(206);
  expect(res.headers.get("content-range")).toBe("bytes 0-3/9");
  expect(upstream()).toBe("http://frigate.local/api/cam/start/10/end/20/clip.mp4");
  expect(((fetchSpy.mock.calls[0] as any)[1].headers as Headers).get("range")).toBe("bytes=0-3");

  await get("/api/frigate/cameras/cam/recordings/summary?timezone=America/Sao_Paulo");
  expect(upstream(1)).toBe("http://frigate.local/api/cam/recordings/summary?timezone=America%2FSao_Paulo");
  await get("/api/frigate/cameras/cam/latest.jpg");
  expect(upstream(2)).toBe("http://frigate.local/api/cam/latest.jpg");

  fetchSpy.mockResolvedValue(new Response("x", { status: 500 }));
  expect((await get("/api/frigate/cameras/cam/latest.jpg")).status).toBe(502);
  expect((await get("/api/frigate/cameras/cam/clip.mp4?start=a&end=2")).status).toBe(422);
});

test("ptz sends the command over the websocket and validates it", async () => {
  expect((await send("POST", "/api/frigate/cameras/cam/ptz", { command: "MOVE_LEFT" })).status).toBe(200);
  await send("POST", "/api/frigate/cameras/cam/ptz", { command: "preset_1" });
  expect(sent).toEqual([
    { topic: "cam/ptz", payload: "MOVE_LEFT" },
    { topic: "cam/ptz", payload: "preset_1" },
  ]);
  expect((await send("POST", "/api/frigate/cameras/cam/ptz", { command: "REBOOT" })).status).toBe(422);
  wsFails = true;
  expect((await send("POST", "/api/frigate/cameras/cam/ptz", { command: "STOP" })).status).toBe(502);
});

test("features toggle maps to ON/OFF and only allows known features", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  expect((await send("PUT", "/api/frigate/cameras/cam/features/audio", { value: true })).status).toBe(200);
  expect(upstream()).toBe("http://frigate.local/api/camera/cam/set/audio");
  expect((fetchSpy.mock.calls[0] as any)[1].body).toBe('{"value":"ON"}');
  await send("PUT", "/api/frigate/cameras/cam/features/detect", { value: false });
  expect((fetchSpy.mock.calls[1] as any)[1].body).toBe('{"value":"OFF"}');
  expect((await send("PUT", "/api/frigate/cameras/cam/features/enabled", { value: false })).status).toBe(422);
  fetchSpy.mockResolvedValue(new Response("x", { status: 500 }));
  expect((await send("PUT", "/api/frigate/cameras/cam/features/audio", { value: true })).status).toBe(502);
  fetchSpy.mockRejectedValue(new Error("down"));
  expect((await send("PUT", "/api/frigate/cameras/cam/features/audio", { value: true })).status).toBe(502);
});

test("stats trims the raw payload", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      cameras: { a: { camera_fps: 5, skipped_fps: 0, detection_fps: 2, detection_enabled: true } },
      gpu_usages: { "intel-vaapi": { gpu: "1.0%", mem: "-%" } },
      detectors: { openvino: { inference_speed: 8.4 } },
      cpu_usages: { 1: { cmdline: "secret" } },
      service: {
        version: "0.17.2-x",
        latest_version: "0.18.0",
        uptime: 10,
        storage: {
          "/media/frigate/recordings": { total: 100, used: 90, free: 10 },
          "/dev/shm": { total: 512, used: 50, free: 400 },
        },
      },
    }),
  );
  const res = await get("/api/frigate/stats");
  const body = await res.json();
  expect(body.cameras.a).toEqual({ fps: 5, skippedFps: 0, detectionFps: 2, detecting: true });
  expect(body.gpu).toEqual({ name: "intel-vaapi", usage: "1.0%", memory: "-%" });
  expect(body.memory).toEqual([{ name: "Memória compartilhada", total: 512, used: 50 }]);
  expect(body.disk).toEqual({ total: 100, used: 90, free: 10 });
  expect(body.detector).toEqual({ name: "openvino", inferenceMs: 8.4 });
  expect(JSON.stringify(body)).not.toContain("secret");
});

test("stats is 502 when frigate is down", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));
  expect((await get("/api/frigate/stats")).status).toBe(502);
});
