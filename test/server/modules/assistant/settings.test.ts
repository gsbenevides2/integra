import { describe, expect, mock, test } from "bun:test";

import { makeFakeDb } from "../../../helpers/modules-db";

const fake = makeFakeDb();
mock.module("@server/db", () => ({ db: new Proxy({}, { get: (_t, p) => (fake.db as never)[p] }) }));

const { AssistantSettingsService } = await import("@server/modules/assistant/service/settings");

describe("AssistantSettingsService", () => {
  test("reads the user's stored instructions, defaulting to empty", async () => {
    new (AssistantSettingsService as unknown as new () => object)();
    fake.push([{ extraInstructions: "Me chame de Gui." }]);
    expect(await AssistantSettingsService.get("u1")).toEqual({
      extraInstructions: "Me chame de Gui.",
    });
    fake.push([]);
    expect(await AssistantSettingsService.get("u2")).toEqual({
      extraInstructions: "",
    });
  });

  test("upserts the user's instructions", async () => {
    fake.calls.length = 0;
    fake.push(undefined);
    expect(await AssistantSettingsService.update("u1", { extraInstructions: "x" })).toEqual({
      extraInstructions: "x",
    });
    expect(fake.calls).toEqual(["insert", "values", "onConflictDoUpdate"]);
  });
});
