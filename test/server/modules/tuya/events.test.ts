import { diffDeviceState, tuyaEvents } from "@server/modules/tuya/events";
import { OFFLINE_STATE } from "@server/modules/tuya/model";

import { expect, test } from "bun:test";

test("diffDeviceState", () => {
  expect(diffDeviceState(null, OFFLINE_STATE)).toEqual([]);
  expect(
    diffDeviceState(OFFLINE_STATE, {
      ...OFFLINE_STATE,
      power: true,
      channels: { "1": true },
    }),
  ).toEqual(["power", "channels"]);
  expect(diffDeviceState(OFFLINE_STATE, { ...OFFLINE_STATE })).toEqual([]);
});

test("device and sensor listeners receive events and can unsubscribe", () => {
  const seen: unknown[] = [];
  const offDevice = tuyaEvents.onDeviceChange((e) => seen.push(e));
  const offSensor = tuyaEvents.onSensorChange((e) => seen.push(e));
  tuyaEvents.emitDeviceChange({ a: 1 } as never);
  tuyaEvents.emitSensorChange({ b: 2 } as never);
  offDevice();
  offSensor();
  tuyaEvents.emitDeviceChange({ a: 3 } as never);
  tuyaEvents.emitSensorChange({ b: 4 } as never);
  expect(seen).toEqual([{ a: 1 }, { b: 2 }]);
});
