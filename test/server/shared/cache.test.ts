import { redisGet, redisSet } from "@server/shared/cache";

import { afterEach, expect, spyOn, test } from "bun:test";

afterEach(() => {
  (Bun.redis.get as unknown as { mockRestore?: () => void }).mockRestore?.();
  (Bun.redis.set as unknown as { mockRestore?: () => void }).mockRestore?.();
});

test("redisGet returns hit and miss values", async () => {
  const get = spyOn(Bun.redis, "get").mockResolvedValueOnce("v").mockResolvedValueOnce(null);
  expect(await redisGet("k")).toBe("v");
  expect(await redisGet("k")).toBeNull();
  expect(get).toHaveBeenCalledWith("k");
});

test("redisSet writes through", async () => {
  const set = spyOn(Bun.redis, "set").mockResolvedValue("OK");
  await redisSet("k", "v");
  expect(set).toHaveBeenCalledWith("k", "v");
});
