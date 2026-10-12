import { describe, expect, test } from "bun:test";

import { fail, useApi } from "../../../helpers/dash-api";

const calls = useApi({
  "GET /api/assistant/voice-profiles": () => voices,
  "POST /api/assistant/voice-profiles": () => ({ id: "v9" }),
  "PATCH /api/assistant/voice-profiles/:id": () => ({ ok: true }),
  "DELETE /api/assistant/voice-profiles/:id": () => ({ ok: true }),
});

let voices: unknown = [
  { id: "v1", label: "Gui", embeddings: [[0.1, 0.2]], dims: 2, modelId: "m1" },
];

const { createVoiceProfile, deleteVoiceProfile, fetchVoiceProfiles, renameVoiceProfile } =
  await import("@public/components/VoiceAssistantContext/voiceProfile");

describe("voiceProfile client", () => {
  test("lists the user's voices", async () => {
    voices = [{ id: "v1", label: "Gui", embeddings: [[0.1]], dims: 1, modelId: "m1" }];
    expect(await fetchVoiceProfiles()).toEqual(voices as never);
  });

  test("returns an empty list when the route is forbidden", async () => {
    voices = undefined;
    // 200 with null body still yields [] via the `!data` guard.
    expect(await fetchVoiceProfiles()).toEqual([]);
  });

  test("creates a labelled voice", async () => {
    await createVoiceProfile("Gui", [[1, 2]], "m1");
    const call = calls.at(-1)!;
    expect(call.method).toBe("POST");
    expect(call.body).toEqual({ label: "Gui", embeddings: [[1, 2]], modelId: "m1" });
  });

  test("renames a voice by id", async () => {
    await renameVoiceProfile("v1", "Celular");
    const call = calls.at(-1)!;
    expect(call.method).toBe("PATCH");
    expect(call.path).toBe("/api/assistant/voice-profiles/v1");
    expect(call.body).toEqual({ label: "Celular" });
  });

  test("deletes a voice by id", async () => {
    await deleteVoiceProfile("v1");
    const call = calls.at(-1)!;
    expect(call.method).toBe("DELETE");
    expect(call.path).toBe("/api/assistant/voice-profiles/v1");
  });

  test("throws when a write fails", async () => {
    // Point every route at a 500 so each write wrapper rejects.
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(fail().body), {
        status: 500,
        headers: { "content-type": "application/json" },
      })) as never;
    await expect(createVoiceProfile("X", [[1]], "m1")).rejects.toThrow();
    await expect(renameVoiceProfile("v1", "X")).rejects.toThrow();
    await expect(deleteVoiceProfile("v1")).rejects.toThrow();
  });
});
