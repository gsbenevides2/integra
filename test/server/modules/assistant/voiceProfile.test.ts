import { describe, expect, mock, test } from "bun:test";

import { makeFakeDb } from "../../../helpers/modules-db";

const fake = makeFakeDb();
mock.module("@server/db", () => ({ db: new Proxy({}, { get: (_t, p) => (fake.db as never)[p] }) }));

const { VoiceProfileService } = await import("@server/modules/assistant/service/voiceProfile");

describe("VoiceProfileService", () => {
  test("reports no enrolment when there is no row", async () => {
    new (VoiceProfileService as unknown as new () => object)();
    fake.push([]);
    expect(await VoiceProfileService.get("u1")).toEqual({
      enrolled: false,
      embeddings: [],
      dims: 0,
      modelId: "",
    });
  });

  test("returns the stored embeddings when enrolled", async () => {
    fake.push([{ embeddings: [[0.1, 0.2]], dims: 2, modelId: "m1" }]);
    expect(await VoiceProfileService.get("u1")).toEqual({
      enrolled: true,
      embeddings: [[0.1, 0.2]],
      dims: 2,
      modelId: "m1",
    });
  });

  test("upserts embeddings with their inferred dims", async () => {
    fake.calls.length = 0;
    fake.push(undefined);
    expect(await VoiceProfileService.upsert("u1", [[1, 2, 3]], "m1")).toEqual({
      enrolled: true,
      embeddings: [[1, 2, 3]],
      dims: 3,
      modelId: "m1",
    });
    expect(fake.calls).toEqual(["insert", "values", "onConflictDoUpdate"]);
  });

  test("deletes the profile", async () => {
    fake.calls.length = 0;
    fake.push(undefined);
    await VoiceProfileService.delete("u1");
    expect(fake.calls).toEqual(["delete", "where"]);
  });
});
