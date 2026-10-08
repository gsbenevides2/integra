import * as info from "@server/utils/getProjectInfo";

import { expect, test } from "bun:test";

test("exposes package metadata", () => {
  expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
  expect(info.simpleName).toBeString();
  expect(info.title).toBeString();
  expect(info.repository).toBeDefined();
  expect(info.author).toBeDefined();
  expect(info.license).toBeString();
  expect(info.description).toBeString();
});
