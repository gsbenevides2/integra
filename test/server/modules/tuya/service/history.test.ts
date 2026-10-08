import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";

import { setTuyaEnv } from "../../../../helpers/tuya-cloud";
import { fakeDbCalls, installFakeDb, resetFakeDb } from "../../../../helpers/tuya-db";

let restoreEnv: () => void;
let restoreDb: () => void;
let HistoryService: typeof import("@server/modules/tuya/service/history").HistoryService;

beforeAll(async () => {
  restoreEnv = setTuyaEnv();
  restoreDb = await installFakeDb();
  ({ HistoryService } = await import("@server/modules/tuya/service/history"));
});
afterAll(() => {
  restoreDb();
  restoreEnv();
});
beforeEach(resetFakeDb);

test("pruneAll deletes readings and state history", async () => {
  expect(new (HistoryService as never as new () => object)()).toBeDefined();
  await HistoryService.pruneAll();
  expect(fakeDbCalls.filter((c) => c.method === "delete")).toHaveLength(2);
});
