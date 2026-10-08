import { getFrigateEdenClient, getTuyaEdenClient } from "@public/dashboards/tuya/client";

import { afterEach, expect, test } from "bun:test";

import { mockTuyaFetch } from "../../../helpers/tuya-fetch";

let m: ReturnType<typeof mockTuyaFetch>;
afterEach(() => m.restore());

test("tuya client hits /api/tuya", async () => {
  m = mockTuyaFetch({ "GET /api/tuya/presets": () => [{ id: "p" }] });
  const { data } = await getTuyaEdenClient().api.tuya.presets.get();
  expect(data).toEqual([{ id: "p" }] as any);
  expect(m.calls[0]!.path).toBe("/api/tuya/presets");
});

test("frigate client hits /api/frigate", async () => {
  m = mockTuyaFetch({ "GET /api/frigate/cameras": () => ["a"] });
  const { data } = await getFrigateEdenClient().api.frigate.cameras.get();
  expect(data).toEqual(["a"] as any);
});
