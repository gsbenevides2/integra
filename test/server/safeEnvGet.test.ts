import safeEnvGet from "@server/safeEnvGet";

import { expect, test } from "bun:test";

test("returns the value when set", () => {
  process.env.__SAFE_ENV_TEST = "x";
  expect(safeEnvGet("__SAFE_ENV_TEST")).toBe("x");
  delete process.env.__SAFE_ENV_TEST;
});

test("throws when missing or empty", () => {
  expect(() => safeEnvGet("__SAFE_ENV_MISSING")).toThrow(
    "Missing enviroment variable: __SAFE_ENV_MISSING",
  );
  process.env.__SAFE_ENV_EMPTY = "";
  expect(() => safeEnvGet("__SAFE_ENV_EMPTY")).toThrow();
  delete process.env.__SAFE_ENV_EMPTY;
});
