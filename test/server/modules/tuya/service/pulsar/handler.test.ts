import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";

import { mockTuyaFetch, setTuyaEnv } from "../../../../../helpers/tuya-cloud";
import { fakeDbCalls, fakeDbResults, installFakeDb, resetFakeDb } from "../../../../../helpers/tuya-db";

let restoreEnv: () => void;
let restoreDb: () => void;
let handlePulsarMessage: typeof import("@server/modules/tuya/service/pulsar/handler").handlePulsarMessage;
let tuyaEvents: typeof import("@server/modules/tuya/events").tuyaEvents;

beforeAll(async () => {
  restoreEnv = setTuyaEnv();
  restoreDb = await installFakeDb();
  ({ handlePulsarMessage } = await import("@server/modules/tuya/service/pulsar/handler"));
  ({ tuyaEvents } = await import("@server/modules/tuya/events"));
});
afterAll(() => {
  restoreDb();
  restoreEnv();
});
beforeEach(resetFakeDb);

const msg = (data: Record<string, unknown>) => ({
  messageId: "m1",
  payload: { data, protocol: 4, pv: "2.0", t: 1 },
});
const inserts = () => fakeDbCalls.filter((c) => c.method === "insert").length;

test("messages without devId are ignored", async () => {
  await handlePulsarMessage(msg({}));
  expect(fakeDbCalls).toHaveLength(0);
});

test("messages with neither bizCode nor status do nothing", async () => {
  await handlePulsarMessage(msg({ devId: "x" }));
  await handlePulsarMessage(msg({ devId: "x", status: [] }));
  expect(fakeDbCalls).toHaveLength(0);
});

test("online change on a sensor updates its online flag", async () => {
  fakeDbResults.push([{ id: "s1" }]);
  await handlePulsarMessage(msg({ devId: "x", bizCode: "offline" }));
  expect(fakeDbCalls.some((c) => c.method === "update")).toBe(true);
});

test("online change on an unknown device is a no-op", async () => {
  fakeDbResults.push([], []);
  await handlePulsarMessage(msg({ devId: "x", bizCode: "online" }));
  expect(inserts()).toBe(0);
});

test("online change on a lamp records state, seeding the cache from the cloud once", async () => {
  const { calls, spy } = mockTuyaFetch(() => ({
    success: true,
    result: [{ id: "lamp1", status: [{ code: "switch_led", value: true }] }],
  }));
  const events: unknown[] = [];
  const off = tuyaEvents.onDeviceChange((e) => events.push(e));
  // sensor lookup, device lookup, device lookup (report), latest state, device (publish)
  fakeDbResults.push([], [{ id: "d", kind: "lamp" }], [{ id: "d", kind: "lamp" }], [], [{ id: "d" }]);
  await handlePulsarMessage(msg({ devId: "lamp1", bizCode: "online" }));
  expect(calls).toHaveLength(1);
  expect(inserts()).toBe(1);
  expect(events).toHaveLength(1);

  // second report reuses the cache: no more cloud calls
  fakeDbResults.push([{ id: "d", kind: "lamp" }], [], [{ id: "d" }]);
  await handlePulsarMessage(msg({ devId: "lamp1", status: [{ code: "bright_value", value: 100 }] }));
  expect(calls).toHaveLength(1);
  off();
  spy.mockRestore();
});

test("switch devices use the switch mapper; a failing cloud seed is tolerated", async () => {
  const { spy } = mockTuyaFetch(() => ({ success: false, msg: "down" }));
  fakeDbResults.push([{ id: "d2", kind: "switch" }], [], [{ id: "d2" }]);
  await handlePulsarMessage(msg({ devId: "sw1", status: [{ code: "switch_1", value: true }] }));
  expect(inserts()).toBe(1);
  spy.mockRestore();
});

test("sensor reports store only changed readings and emit events", async () => {
  const events: any[] = [];
  const off = tuyaEvents.onSensorChange((e) => events.push(e));
  // device lookup (none), sensor lookup, setKind, latest readings, insert, setLastEventAt
  fakeDbResults.push(
    [],
    [{ id: "s", kind: "unknown" }],
    [],
    [{ sensorId: "s", code: "pir", value: "none" }],
  );
  await handlePulsarMessage(
    msg({
      devId: "pirsensor",
      status: [
        { code: "pir", value: "pir" },
        { code: "battery", value: 90 },
      ],
    }),
  );
  expect(events.map((e) => [e.code, e.previousValue])).toEqual([["pir", "none"], ["battery", null]]);

  // unchanged readings and unchanged kind: nothing saved
  fakeDbResults.push([], [{ id: "s", kind: "motion" }], [{ sensorId: "s", code: "pir", value: "pir" }]);
  await handlePulsarMessage(msg({ devId: "pirsensor", status: [{ code: "pir", value: "pir" }] }));
  expect(events).toHaveLength(2);
  off();
});

test("reports for unknown devices are dropped; failures are swallowed", async () => {
  fakeDbResults.push([], []);
  await handlePulsarMessage(msg({ devId: "nobody", status: [{ code: "a", value: 1 }] }));
  fakeDbResults.push(new Error("db down"));
  await handlePulsarMessage(msg({ devId: "nobody", bizCode: "online" }));
});
