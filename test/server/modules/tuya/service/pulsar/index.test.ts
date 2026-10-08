import { encrypt } from "@server/modules/tuya/service/pulsar/utils";

import { afterAll, beforeAll, expect, test } from "bun:test";

import { setTuyaEnv } from "../../../../../helpers/tuya-cloud";
import { installFakeDb } from "../../../../../helpers/tuya-db";
import { FakeWebSocket, installFakeWs } from "../../../../../helpers/tuya-ws";

const restores: (() => void)[] = [];
let startTuyaPulsar: typeof import("@server/modules/tuya/service/pulsar/index").startTuyaPulsar;

beforeAll(async () => {
  restores.push(setTuyaEnv());
  restores.push(await installFakeWs());
  restores.push(await installFakeDb());
  ({ startTuyaPulsar } = await import("@server/modules/tuya/service/pulsar/index"));
});
afterAll(() => restores.reverse().forEach((r) => r()));

const key = "0123456789abcdef0123456789abcdef";
const frame = (data: unknown) =>
  JSON.stringify({
    messageId: "m1",
    payload: Buffer.from(JSON.stringify({ data: encrypt(data, key) })).toString("base64"),
    properties: { em: "aes_ecb" },
  });

test("wires lifecycle, message and error events", async () => {
  process.env.TUYA_DATA_CENTER = "eu";
  process.env.TUYA_PULSAR_ENV = "test";
  startTuyaPulsar();
  const ws = FakeWebSocket.instances.at(-1)!;
  expect(ws.url).toContain("mqe.tuyaeu.com");
  expect(ws.url).toContain("event-test");

  ws.emit("open"); // connected, starts the connection span
  // message without devId: acked, handled as a no-op
  ws.emit("message", Buffer.from(frame({})));
  expect(ws.sent).toContain(JSON.stringify({ messageId: "m1" }));
  ws.emit("message", Buffer.from("garbage")); // logger ERROR path, then error event
  ws.emit("error", new Error("socket")); // recordError with Error
  ws.emit("error", "plain string"); // recordError with non-Error
  ws.emit("close", 1000); // closes span
  await new Promise((r) => setTimeout(r, 1100)); // default retryTimeout is 1000ms
  const next = FakeWebSocket.instances.at(-1)!;
  expect(next).not.toBe(ws);
  next.emit("open"); // reconnect
  next.emit("close");
  delete process.env.TUYA_DATA_CENTER;
  delete process.env.TUYA_PULSAR_ENV;
});

test("defaults to the US region and prod env", () => {
  startTuyaPulsar();
  const ws = FakeWebSocket.instances.at(-1)!;
  expect(ws.url).toContain("mqe.tuyaus.com");
  expect(ws.url).toContain("/out/event/");
});
