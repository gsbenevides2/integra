import { redisGet, redisSet } from "@server/shared/cache";

import { afterEach, expect, spyOn, test } from "bun:test";

afterEach(() => {
  (Bun.redis.get as unknown as { mockRestore?: () => void }).mockRestore?.();
  (Bun.redis.set as unknown as { mockRestore?: () => void }).mockRestore?.();
  (Bun.redis.connect as unknown as { mockRestore?: () => void }).mockRestore?.();
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

test("reconnects and retries when the client is disconnected", async () => {
  const get = spyOn(Bun.redis, "get")
    .mockRejectedValueOnce(new Error("closed"))
    .mockResolvedValueOnce("v");
  const connect = spyOn(Bun.redis, "connect").mockResolvedValue(undefined);
  expect(await redisGet("k")).toBe("v");
  expect(connect).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledTimes(2);
});

test("rethrows the original error when the client is connected", async () => {
  spyOn(Bun.redis, "set").mockRejectedValue(new Error("boom"));
  const connect = spyOn(Bun.redis, "connect").mockResolvedValue(undefined);
  Object.defineProperty(Bun.redis, "connected", { value: true, configurable: true });
  try {
    await expect(redisSet("k", "v")).rejects.toThrow("boom");
    expect(connect).not.toHaveBeenCalled();
  } finally {
    delete (Bun.redis as { connected?: boolean }).connected;
  }
});
