import { trace } from "@opentelemetry/api";
import { afterAll, beforeAll, expect, mock, spyOn, test } from "bun:test";

import { mockTuyaFetch, setTuyaEnv } from "../../../../../helpers/tuya-cloud";

let restoreEnv: () => void;
let client: typeof import("@server/modules/tuya/service/cloud/client");

beforeAll(async () => {
  restoreEnv = setTuyaEnv();
  process.env.TUYA_DATA_CENTER = "eu";
  client = await import("@server/modules/tuya/service/cloud/client");
  process.env.TUYA_DATA_CENTER = "eu";
  client = await import("@server/modules/tuya/service/cloud/client");
  delete process.env.TUYA_DATA_CENTER;
});
afterAll(() => restoreEnv());

test("getDevicesStatus short-circuits on empty input and maps results", async () => {
  expect((await client.getDevicesStatus([])).size).toBe(0);

  const { calls, spy } = mockTuyaFetch(() => ({
    success: true,
    result: [{ id: "a", status: [{ code: "switch_led", value: true }] }],
  }));
  const map = await client.getDevicesStatus(["a", "b"]);
  expect(map.get("a")).toEqual([{ code: "switch_led", value: true }]);
  expect(decodeURIComponent(calls[0]!.path)).toContain("device_ids=a,b");
  spy.mockRestore();
});

test("getDeviceStatus falls back to empty", async () => {
  const { spy } = mockTuyaFetch(() => ({ success: true, result: [] }));
  expect(await client.getDeviceStatus("zzz")).toEqual([]);
  spy.mockRestore();
});

test("sendDeviceCommands POSTs the commands", async () => {
  const { calls, spy } = mockTuyaFetch(() => ({ success: true, result: true }));
  await client.sendDeviceCommands("dev1", [{ code: "switch_led", value: true }]);
  expect(calls[0]!.method).toBe("POST");
  expect(calls[0]!.path).toContain("/dev1/commands");
  expect(calls[0]!.body).toEqual({ commands: [{ code: "switch_led", value: true }] });
  spy.mockRestore();
});

test("getDeviceDetail returns the unwrapped result", async () => {
  const { spy } = mockTuyaFetch(() => ({ success: true, result: { id: "d", online: true } }));
  expect(await client.getDeviceDetail("d")).toMatchObject({ online: true });
  spy.mockRestore();
});

test("failed envelopes throw", async () => {
  const { spy } = mockTuyaFetch(() => ({ success: false, code: 1108, msg: "bad" }));
  await expect(client.sendDeviceCommands("d", [])).rejects.toThrow("[1108] bad");
  spy.mockRestore();
});

test("failed envelopes are flagged on the active span", async () => {
  const span = {
    setAttribute: mock(() => {}),
    recordException: mock(() => {}),
    setStatus: mock(() => {}),
  };
  const active = spyOn(trace, "getActiveSpan").mockReturnValue(span as never);
  const { spy } = mockTuyaFetch(() => ({ success: false, msg: "nope" }));
  await expect(client.sendDeviceCommands("d", [])).rejects.toThrow("nope");
  expect(span.setAttribute).toHaveBeenCalledWith("tuya.error_code", -1);
  expect(span.recordException).toHaveBeenCalled();
  active.mockRestore();
  spy.mockRestore();
});


test("baseUrl maps the data centre and rejects unknown ones", () => {
  process.env.TUYA_DATA_CENTER = "eu";
  expect(client.baseUrl()).toBe("https://openapi.tuyaeu.com");
  delete process.env.TUYA_DATA_CENTER;
  expect(client.baseUrl()).toBe("https://openapi.tuyaus.com");
  process.env.TUYA_DATA_CENTER = "mars";
  expect(() => client.baseUrl()).toThrow("Unknown TUYA_DATA_CENTER");
  delete process.env.TUYA_DATA_CENTER;
});
