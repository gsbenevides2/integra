import { APP_VERSION } from "@public/version";

import { expect, test } from "bun:test";

import packageJson from "../../package.json";

test("APP_VERSION mirrors package.json", () => {
  expect(APP_VERSION).toBe(packageJson.version);
});
