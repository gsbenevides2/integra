import { TUYA_PASULAR_ENV, TuyaRegionConfigEnum } from "@server/modules/tuya/service/pulsar/config";
import { encrypt } from "@server/modules/tuya/service/pulsar/utils";

import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";

import { FakeWebSocket, installFakeWs } from "../../../../../helpers/tuya-ws";

const key = "0123456789abcdef0123456789abcdef";
let restoreWs: () => void;
let Client: typeof import("@server/modules/tuya/service/pulsar/client").default;

beforeAll(async () => {
  restoreWs = await installFakeWs();
  Client = (await import("@server/modules/tuya/service/pulsar/client")).default;
});
afterAll(() => restoreWs());
beforeEach(() => {
  FakeWebSocket.instances.length = 0;
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function make(extra: object = {}) {
  const logs: unknown[][] = [];
  const client = new Client({
    accessId: "id",
    accessKey: key,
    env: TUYA_PASULAR_ENV.TEST,
    url: TuyaRegionConfigEnum.US,
    timeout: 5,
    retryTimeout: 1,
    logger: (...a) => logs.push(a),
    ...extra,
  });
  return { client, logs };
}

const frame = (data: unknown, em = "aes_ecb") =>
  JSON.stringify({
    messageId: "m1",
    payload: Buffer.from(JSON.stringify({ data: encrypt(data, key) })).toString("base64"),
    properties: { em },
  });

test("static members expose the enums", () => {
  expect(Client.URL).toBe(TuyaRegionConfigEnum);
  expect(Client.env).toBe(TUYA_PASULAR_ENV);
});

test("start connects with credentials and emits open; acks go to the socket", () => {
  const { client } = make();
  client.ackMessage("ignored-before-start");
  const opened: unknown[] = [];
  client.open((ws) => opened.push(ws));
  client.start();
  const ws = FakeWebSocket.instances[0]!;
  expect(ws.url).toContain("/out/event-test/id-sub?subscriptionType=Failover");
  expect((ws.options as any).headers.username).toBe("id");
  ws.emit("open");
  expect(opened).toHaveLength(1);
  client.ackMessage("m9");
  expect(ws.sent).toEqual([JSON.stringify({ messageId: "m9" })]);
});

test("open with a non-open socket keeps going", () => {
  const { client } = make();
  client.start();
  const ws = FakeWebSocket.instances[0]!;
  ws.readyState = 0;
  ws.emit("open");
});

test("decrypts messages and forwards them", () => {
  const { client, logs } = make();
  const got: any[] = [];
  client.message((_ws, m) => got.push(m));
  client.start();
  FakeWebSocket.instances[0]!.emit("message", Buffer.from(frame({ devId: "x" })));
  expect(got[0].messageId).toBe("m1");
  expect(got[0].payload.data).toEqual({ devId: "x" });
  expect(logs.length).toBeGreaterThan(0);
});

test("bad frames raise an error event and an ERROR log", () => {
  const { client, logs } = make();
  const errors: unknown[] = [];
  client.error((_ws, e) => errors.push(e));
  client.start();
  FakeWebSocket.instances[0]!.emit("message", Buffer.from("not json"));
  expect(errors).toHaveLength(1);
  expect(logs.some((l) => l[0] === "ERROR")).toBe(true);
  FakeWebSocket.instances[0]!.emit("error", new Error("boom"));
  expect(errors).toHaveLength(2);
});

test("ping gets a pong; pong is forwarded; keepAlive timer pings", async () => {
  const { client } = make();
  const seen: string[] = [];
  client.ping(() => seen.push("ping"));
  client.pong(() => seen.push("pong"));
  client.start();
  const ws = FakeWebSocket.instances[0]!;
  ws.emit("ping");
  ws.emit("pong");
  expect(seen).toEqual(["ping", "pong"]);
  expect(ws.pongs).toEqual(["id"]);
  await wait(30);
  expect(ws.pings.length).toBeGreaterThan(0);
});

test("close triggers a reconnect that emits reconnect", async () => {
  const { client } = make();
  const closed: unknown[] = [];
  const reconnected: unknown[] = [];
  client.close((...a) => closed.push(a));
  client.reconnect((ws) => reconnected.push(ws));
  client.start();
  FakeWebSocket.instances[0]!.emit("close", 1006);
  expect(closed).toHaveLength(1);
  await wait(20);
  expect(FakeWebSocket.instances).toHaveLength(2);
  FakeWebSocket.instances[1]!.emit("open");
  expect(reconnected).toHaveLength(1);
});

test("no reconnect once retries are disabled", async () => {
  const { client } = make({ maxRetryTimes: 0 });
  client.start();
  FakeWebSocket.instances[0]!.emit("close");
  await wait(10);
  expect(FakeWebSocket.instances).toHaveLength(1);
});

test("defaults to console.log when no logger is given", () => {
  const log = spyOn(console, "log").mockImplementation(() => {});
  const client = new Client({
    accessId: "id",
    accessKey: key,
    env: TUYA_PASULAR_ENV.PROD,
    url: TuyaRegionConfigEnum.EU,
  });
  client.start();
  FakeWebSocket.instances[0]!.emit("message", Buffer.from(frame({ a: 1 })));
  expect(log).toHaveBeenCalled();
  log.mockRestore();
});
