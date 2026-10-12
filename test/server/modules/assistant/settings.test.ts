import { describe, expect, mock, test } from "bun:test";

import { makeFakeDb } from "../../../helpers/modules-db";

const fake = makeFakeDb();
mock.module("@server/db", () => ({ db: new Proxy({}, { get: (_t, p) => (fake.db as never)[p] }) }));

const { AssistantSettingsService } = await import("@server/modules/assistant/service/settings");

describe("AssistantSettingsService", () => {
  test("reads the user's stored instructions, defaulting to empty", async () => {
    new (AssistantSettingsService as unknown as new () => object)();
    fake.push([{ extraInstructions: "Me chame de Gui.", voiceMatchThreshold: 0.7 }]);
    expect(await AssistantSettingsService.get("u1")).toEqual({
      extraInstructions: "Me chame de Gui.",
      voiceMatchThreshold: 0.7,
    });
    fake.push([]);
    expect(await AssistantSettingsService.get("u2")).toEqual({
      extraInstructions: "",
      voiceMatchThreshold: 0.6,
    });
  });

  test("upserts the user's instructions", async () => {
    fake.calls.length = 0;
    fake.push(undefined);
    expect(
      await AssistantSettingsService.update("u1", {
        extraInstructions: "x",
        voiceMatchThreshold: 0.8,
      }),
    ).toEqual({
      extraInstructions: "x",
      voiceMatchThreshold: 0.8,
    });
    expect(fake.calls).toEqual(["insert", "values", "onConflictDoUpdate"]);
  });
});
