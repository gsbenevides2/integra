import { afterAll, afterEach, describe, expect, spyOn, test } from "bun:test";

import { installTestAuthz, TEST_USER } from "../../../helpers/auth";
import { provideEnv, TUYA_ENV } from "./helpers";

afterAll(provideEnv(TUYA_ENV));
afterAll(installTestAuthz());

const { assistantRoutes, VOSK_MODEL_FILE, voskAssetRoutes } = await import("@server/modules/assistant");
const { MAX_AUDIO_BYTES } = await import("@server/modules/assistant/model");
const { AssistantAgent } = await import("@server/modules/assistant/service/agent");
const { AudioService } = await import("@server/modules/assistant/service/audio");
const { ConversationService } = await import("@server/modules/assistant/service/conversation");
const { ImageStorage, MAX_IMAGE_BYTES } = await import("@server/modules/assistant/service/images");
const { AssistantSettingsService } = await import("@server/modules/assistant/service/settings");

const spies: { mockRestore: () => void }[] = [];
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

const call = (path: string, init?: RequestInit) =>
  assistantRoutes.handle(new Request(`http://localhost/api/assistant${path}`, init));
const send = (method: string, path: string, body: unknown) =>
  call(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("assistant routes", () => {
  test("config reports whether the wake word model is deployed", async () => {
    const exists = await Bun.file(VOSK_MODEL_FILE).exists();
    expect(await (await call("/config")).json()).toEqual({ wakeWordEnabled: exists });
  });

  test("stt transcribes a raw WAV body and rejects empty or huge ones", async () => {
    const transcribe = spyOn(AudioService, "transcribe").mockResolvedValue("liga a luz");
    spies.push(transcribe);
    const wav = new Uint8Array([82, 73, 70, 70]);
    const response = await call("/stt", { method: "POST", headers: { "content-type": "audio/wav" }, body: wav });
    expect(await response.json()).toEqual({ text: "liga a luz" });
    expect(transcribe).toHaveBeenCalledWith(wav);

    expect((await call("/stt", { method: "POST", body: new Uint8Array() })).status).toBe(400);
    const huge = new Uint8Array(MAX_AUDIO_BYTES + 1);
    expect((await call("/stt", { method: "POST", body: huge })).status).toBe(400);
  });

  test("chat runs the agent with the user's uploads", async () => {
    const run = spyOn(AssistantAgent, "run").mockResolvedValue({
      conversationId: "c1",
      reply: "Oi!",
      actions: [],
      images: [],
      endConversation: false,
    });
    spies.push(run);
    expect(await (await send("POST", "/chat", { text: " Olá " })).json()).toMatchObject({ reply: "Oi!" });
    expect(run).toHaveBeenCalledWith(TEST_USER, { text: "Olá", conversationId: undefined, uploads: [] });

    const key = `assistant/${TEST_USER.id}/upload/a.jpg`;
    const conversationId = crypto.randomUUID();
    await send("POST", "/chat", { text: "isso?", conversationId, images: [key] });
    expect(run).toHaveBeenLastCalledWith(TEST_USER, {
      text: "isso?",
      conversationId,
      uploads: [{ key, mediaType: "image/jpeg", source: "upload" }],
    });

    expect((await send("POST", "/chat", { text: "  " })).status).toBe(422);
    const foreign = await send("POST", "/chat", { text: "x", images: ["assistant/other/upload/a.jpg"] });
    expect(foreign.status).toBe(403);
  });

  test("chat/stream answers with Server-Sent Events", async () => {
    const reply = { conversationId: "c1", reply: "Oi!", actions: [], images: [], endConversation: false };
    const run = spyOn(AssistantAgent, "run").mockImplementation(async (_user, _request, emit) => {
      emit!({ type: "conversation", conversationId: "c1" });
      emit!({ type: "delta", text: "Oi!" });
      emit!({ type: "done", reply });
      return reply;
    });
    spies.push(run);
    const response = await send("POST", "/chat/stream", { text: "Olá" });
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    const frames = (await response.text()).split("\n\n").filter(Boolean);
    expect(frames.map((f) => JSON.parse(f.replace(/^data: /, "")).type)).toEqual([
      "conversation",
      "delta",
      "done",
    ]);
    expect(run.mock.calls[0]?.[1]).toEqual({ text: "Olá", conversationId: undefined, uploads: [] });

    const foreign = await send("POST", "/chat/stream", { text: "x", images: ["assistant/other/upload/a.jpg"] });
    expect(foreign.status).toBe(403);
  });

  test("a failing streamed chat ends with an error event", async () => {
    const run = spyOn(AssistantAgent, "run").mockImplementation(async (_user, _request, emit) => {
      emit!({ type: "conversation", conversationId: "c1" });
      throw new Error("model down");
    });
    spies.push(run);
    const text = await (await send("POST", "/chat/stream", { text: "Olá" })).text();
    expect(text).toContain(JSON.stringify({ type: "error", message: "O assistente não respondeu" }));

    run.mockImplementation(async () => {
      throw "raw";
    });
    expect(await (await send("POST", "/chat/stream", { text: "Olá" })).text()).toContain('"type":"error"');
  });

  test("uploads store a raw image body and reject bad types or sizes", async () => {
    const save = spyOn(ImageStorage, "save").mockResolvedValue({
      key: "assistant/u/upload/a.png",
      mediaType: "image/png",
      source: "upload",
    });
    const view = spyOn(ImageStorage, "view").mockImplementation((i) => ({ ...i, url: "https://signed" }));
    spies.push(save, view);
    const upload = (type: string, body: Uint8Array<ArrayBuffer>) =>
      call("/uploads", { method: "POST", headers: { "content-type": type }, body });

    const ok = await upload("image/png; charset=binary", new Uint8Array([1, 2]));
    expect(await ok.json()).toMatchObject({ key: "assistant/u/upload/a.png", url: "https://signed" });
    expect(save).toHaveBeenCalledWith(TEST_USER.id, new Uint8Array([1, 2]), "image/png", "upload");

    expect((await upload("application/pdf", new Uint8Array([1]))).status).toBe(415);
    expect((await call("/uploads", { method: "POST", body: new Uint8Array([1]) })).status).toBe(415);
    expect((await upload("image/png", new Uint8Array())).status).toBe(400);
    expect((await upload("image/png", new Uint8Array(MAX_IMAGE_BYTES + 1))).status).toBe(400);
  });

  test("a new conversation closes the open ones", async () => {
    const endAll = spyOn(ConversationService, "endAll").mockResolvedValue(undefined);
    spies.push(endAll);
    expect(await (await call("/conversation", { method: "DELETE" })).json()).toEqual({ ok: true });
    expect(endAll).toHaveBeenCalledWith(TEST_USER.id);
  });

  test("history lists, opens and deletes only the user's conversations", async () => {
    const updatedAt = new Date("2026-10-11T12:00:00Z");
    const row = { id: "c1", userId: TEST_USER.id, title: "Oi", endedAt: null, createdAt: updatedAt, updatedAt };
    const stored = { key: "k", mediaType: "image/png", source: "camera" as const, label: "frente" };
    spies.push(
      spyOn(ConversationService, "list").mockResolvedValue([row, { ...row, id: "c2", endedAt: updatedAt }]),
      spyOn(ConversationService, "find").mockImplementation(async (_u, id) => (id === "c1" ? row : null)),
      spyOn(ConversationService, "messages").mockResolvedValue([
        { id: "m1", conversationId: "c1", role: "assistant", text: "Vi.", actions: [], images: [stored], createdAt: updatedAt },
      ]),
      spyOn(ImageStorage, "view").mockImplementation((i) => ({ ...i, url: "https://signed" })),
    );
    const list = await (await call("/conversations")).json();
    expect(list).toEqual([
      { id: "c1", title: "Oi", updatedAt: updatedAt.toISOString(), ended: false },
      { id: "c2", title: "Oi", updatedAt: updatedAt.toISOString(), ended: true },
    ]);

    const detail = await (await call("/conversations/c1")).json();
    expect(detail).toMatchObject({ id: "c1", title: "Oi", ended: false });
    expect(detail.messages[0]).toMatchObject({ role: "assistant", text: "Vi.", images: [{ ...stored, url: "https://signed" }] });
    expect((await call("/conversations/nope")).status).toBe(404);

    const remove = spyOn(ConversationService, "remove").mockImplementation(async (_u, id) =>
      id === "c1" ? [stored] : null,
    );
    const removeImages = spyOn(ImageStorage, "remove").mockResolvedValue(undefined);
    spies.push(remove, removeImages);
    expect(await (await call("/conversations/c1", { method: "DELETE" })).json()).toEqual({ ok: true });
    expect(removeImages).toHaveBeenCalledWith([stored]);
    expect((await call("/conversations/nope", { method: "DELETE" })).status).toBe(404);
  });

  test("settings are read and updated for the current user only", async () => {
    const get = spyOn(AssistantSettingsService, "get").mockResolvedValue({ extraInstructions: "a" });
    const update = spyOn(AssistantSettingsService, "update").mockImplementation(async (_id, s) => s);
    spies.push(get, update);
    expect(await (await call("/settings")).json()).toEqual({ extraInstructions: "a" });
    expect(get).toHaveBeenCalledWith(TEST_USER.id);
    expect(await (await send("PUT", "/settings", { extraInstructions: " b " })).json()).toEqual({
      extraInstructions: "b",
    });
    expect(update).toHaveBeenCalledWith(TEST_USER.id, { extraInstructions: "b" });
    expect((await send("PUT", "/settings", { extraInstructions: "x".repeat(4001) })).status).toBe(422);
  });

  test("tts streams the synthesised mp3", async () => {
    const speech = spyOn(AudioService, "speech").mockResolvedValue(new Response("mp3-bytes"));
    spies.push(speech);
    const response = await send("POST", "/tts", { text: "Pronto" });
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(await response.text()).toBe("mp3-bytes");
    expect(speech).toHaveBeenCalledWith("Pronto");
  });
});

describe("vosk asset routes", () => {
  test("serve the worker and WASM runtime from the installed package", async () => {
    const worker = await voskAssetRoutes.handle(new Request("http://localhost/vosk/vosk.worker.js"));
    // happy-dom's global Response cannot read a BunFile body; the real server
    // uses Bun's own Response, so only the routing and headers are checked here.
    expect(worker.status).toBe(200);
    expect(worker.headers.get("content-type")).toBe("text/javascript");
    const wasm = await voskAssetRoutes.handle(new Request("http://localhost/vosk/vosk.wasm"));
    expect(wasm.headers.get("content-type")).toBe("application/wasm");
  });
});
