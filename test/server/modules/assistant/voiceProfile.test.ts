import { describe, expect, mock, test } from "bun:test";

import { makeFakeDb } from "../../../helpers/modules-db";

const fake = makeFakeDb();
mock.module("@server/db", () => ({ db: new Proxy({}, { get: (_t, p) => (fake.db as never)[p] }) }));

const { VoiceProfileService } = await import("@server/modules/assistant/service/voiceProfile");

describe("VoiceProfileService", () => {
  test("lists the user's enrolled voices", async () => {
    new (VoiceProfileService as unknown as new () => object)();
    fake.calls.length = 0;
    const rows = [
      { id: "v1", label: "Gui", embeddings: [[0.1, 0.2]], dims: 2, modelId: "m1" },
    ];
    fake.push(rows);
    expect(await VoiceProfileService.list("u1")).toEqual(rows);
    expect(fake.calls).toEqual(["select", "from", "where", "orderBy"]);
  });

  test("creates a voice with its inferred dims", async () => {
    fake.calls.length = 0;
    // list() guard first, then the insert returns the new id.
    fake.push([]);
    fake.push([{ id: "v9" }]);
    expect(await VoiceProfileService.create("u1", "Gui", [[1, 2, 3]], "m1")).toEqual({
      id: "v9",
      label: "Gui",
      embeddings: [[1, 2, 3]],
      dims: 3,
      modelId: "m1",
    });
    expect(fake.calls).toEqual([
      "select",
      "from",
      "where",
      "orderBy",
      "insert",
      "values",
      "returning",
    ]);
  });

  test("rejects creating past the per-user limit", async () => {
    fake.calls.length = 0;
    const full = Array.from({ length: 10 }, (_, i) => ({
      id: `v${i}`,
      label: `V${i}`,
      embeddings: [[1]],
      dims: 1,
      modelId: "m1",
    }));
    fake.push(full);
    await expect(VoiceProfileService.create("u1", "Gui", [[1]], "m1")).rejects.toThrow();
  });

  test("renames a voice scoped to its owner", async () => {
    fake.calls.length = 0;
    fake.push(undefined);
    await VoiceProfileService.rename("u1", "v1", "Celular");
    expect(fake.calls).toEqual(["update", "set", "where"]);
  });

  test("deletes a voice scoped to its owner", async () => {
    fake.calls.length = 0;
    fake.push(undefined);
    await VoiceProfileService.delete("u1", "v1");
    expect(fake.calls).toEqual(["delete", "where"]);
  });
});
