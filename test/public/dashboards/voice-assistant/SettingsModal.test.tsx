import React from "react";

import type { Me } from "@public/components/MeContext";
import * as microphone from "@public/components/VoiceAssistantContext/microphone";
import * as speakerModel from "@public/components/VoiceAssistantContext/speakerModel";
import * as transcriber from "@public/components/VoiceAssistantContext/transcriber";

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

import { type ApiCall, fail, useApi } from "../../../helpers/dash-api";
import { ME_FIXTURE, renderWithMe } from "../../../helpers/me";

// No mock.module here: Bun keeps module mocks for every later test file, so the
// real provider, toasts and voice client run, the API is faked at fetch level,
// and only the browser-audio helpers are spied (and restored) per test.
const { CHAT_ROUTE_KEY, VoiceAssistantProvider } = await import(
  "@public/components/VoiceAssistantContext"
);
const { ENROLL_SAMPLES, SettingsModal } = await import(
  "@public/dashboards/voice-assistant/SettingsModal"
);

const ALLOWED: Me = { ...ME_FIXTURE, routes: [CHAT_ROUTE_KEY] };
const MODEL = { voiceModelUrl: "/voice/model.onnx", voiceModelId: "m1" };

interface Voice {
  id: string;
  label: string;
  embeddings: number[][];
  dims: number;
  modelId: string;
}
const voiceOf = (id: string, label: string, modelId = "m1"): Voice => ({
  id,
  label,
  embeddings: [[1, 0]],
  dims: 2,
  modelId,
});

let config: Record<string, unknown> = { wakeWordEnabled: false, ...MODEL };
let settings: unknown = { extraInstructions: "Me chame de Gui.", voiceMatchThreshold: 0.6 };
let saveReply: unknown = { extraInstructions: "", voiceMatchThreshold: 0.6 };
let voices: Voice[] = [];
/** When set, the voice write routes answer with it (e.g. a failure) instead. */
let writeReply: unknown = null;

const idOf = (call: ApiCall) => call.path.split("/").at(-1)!;
const calls = useApi({
  "GET /api/assistant/config": () => config,
  "GET /api/assistant/settings": () => settings,
  "PUT /api/assistant/settings": () => saveReply,
  "GET /api/assistant/voice-profiles": () => voices,
  "POST /api/assistant/voice-profiles": (call) => {
    if (writeReply) return writeReply;
    const voice = { ...voiceOf(`v${voices.length + 1}`, call.body.label), ...call.body };
    voices = [...voices, voice];
    return voice;
  },
  "PATCH /api/assistant/voice-profiles/:id": (call) => {
    if (writeReply) return writeReply;
    voices = voices.map((v) => (v.id === idOf(call) ? { ...v, label: call.body.label } : v));
    return { ok: true };
  },
  "DELETE /api/assistant/voice-profiles/:id": (call) => {
    if (writeReply) return writeReply;
    voices = voices.filter((v) => v.id !== idOf(call));
    return { ok: true };
  },
});

let promptReply: string | null = "Gui";
const realPrompt = window.prompt;
const spies: { mockRestore: () => void }[] = [];
let loadModel: ReturnType<typeof spyOn>;
let capture: ReturnType<typeof spyOn>;

beforeEach(() => {
  config = { wakeWordEnabled: false, ...MODEL };
  settings = { extraInstructions: "Me chame de Gui.", voiceMatchThreshold: 0.6 };
  saveReply = { extraInstructions: "", voiceMatchThreshold: 0.6 };
  voices = [];
  writeReply = null;
  promptReply = "Gui";
  window.prompt = () => promptReply;
  loadModel = spyOn(speakerModel, "loadSpeakerModel").mockResolvedValue({
    embed: async () => new Float32Array([0.5, 0.5]),
  });
  capture = spyOn(transcriber, "captureUtterance").mockResolvedValue({
    samples: new Float32Array([1]),
    sampleRate: 16000,
  } as never);
  spies.push(loadModel, capture, spyOn(microphone, "resumeAudio").mockImplementation(() => {}));
});
afterEach(() => {
  spies.splice(0).forEach((s) => s.mockRestore());
  window.prompt = realPrompt;
  cleanup();
});

function open(onClose: () => void = () => {}) {
  return renderWithMe(
    <VoiceAssistantProvider>
      <SettingsModal isOpen onClose={onClose} />
    </VoiceAssistantProvider>,
    ALLOWED,
  );
}
/** Waits until the settings and the voice section have loaded. */
async function loaded() {
  const textarea = (await screen.findByLabelText(
    "Instruções para a Integra (só valem para você)",
  )) as HTMLTextAreaElement;
  await waitFor(() => expect(textarea.value).toBe("Me chame de Gui."));
  return textarea;
}

describe("SettingsModal settings", () => {
  test("saves the instructions and the shared threshold", async () => {
    const onClose = mock(() => {});
    open(onClose);
    const textarea = await loaded();
    fireEvent.change(textarea, { target: { value: "Fale curto." } });
    fireEvent.change(await screen.findByLabelText(/Rigidez do reconhecimento/), {
      target: { value: "80" },
    });
    expect(screen.getByText("Rigidez do reconhecimento: 80%")).toBeTruthy();
    fireEvent.click(screen.getByText("Salvar"));
    expect(await screen.findByText("Preferências salvas")).toBeTruthy();
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
      extraInstructions: "Fale curto.",
      voiceMatchThreshold: 0.8,
    });
    expect(onClose).toHaveBeenCalled();
  });

  test("reports load and save failures", async () => {
    settings = fail(500);
    saveReply = fail(500);
    open();
    expect(await screen.findByText("Falha ao carregar suas preferências")).toBeTruthy();
    fireEvent.click(screen.getByText("Salvar"));
    expect(await screen.findByText("Falha ao salvar suas preferências")).toBeTruthy();
  });

  test("hides the voice section when no speaker model is deployed", async () => {
    config = { wakeWordEnabled: false };
    open();
    await loaded();
    expect(screen.queryByText("Adicionar voz")).toBeNull();
    expect(calls.some((c) => c.path === "/api/assistant/voice-profiles")).toBe(true);
  });
});

describe("SettingsModal voices", () => {
  test("lists only the voices enrolled with the current model", async () => {
    voices = [voiceOf("v1", "Gui"), voiceOf("v2", "Antiga", "old")];
    open();
    expect(await screen.findByText("Gui")).toBeTruthy();
    expect(screen.queryByText("Antiga")).toBeNull();
    expect(screen.getByText("Outras vozes (e a TV) são ignoradas.")).toBeTruthy();
  });

  test("shows that any voice fires the wake word when none is enrolled", async () => {
    open();
    expect(
      await screen.findByText('Sem voz cadastrada: o "Ei Integra" ativa com qualquer voz.'),
    ).toBeTruthy();
  });

  test("enrolls a labelled voice from the recorded samples", async () => {
    open();
    fireEvent.click(await screen.findByText("Adicionar voz"));
    expect(await screen.findByText("Voz cadastrada")).toBeTruthy();
    expect(await screen.findByText("Gui")).toBeTruthy();
    expect(capture).toHaveBeenCalledTimes(ENROLL_SAMPLES);
    expect(loadModel).toHaveBeenCalledWith(MODEL.voiceModelUrl, MODEL.voiceModelId);
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      label: "Gui",
      embeddings: Array.from({ length: ENROLL_SAMPLES }, () => [0.5, 0.5]),
      modelId: "m1",
    });
  });

  test("does nothing when the label prompt is cancelled or blank", async () => {
    open();
    const add = await screen.findByText("Adicionar voz");
    promptReply = null;
    fireEvent.click(add);
    promptReply = "   ";
    fireEvent.click(add);
    await loaded();
    expect(capture).not.toHaveBeenCalled();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  test("reports an enrolment that fails to save, or fails without an Error", async () => {
    writeReply = fail(500);
    open();
    fireEvent.click(await screen.findByText("Adicionar voz"));
    expect(await screen.findByText("Falha ao salvar a voz")).toBeTruthy();

    loadModel.mockRejectedValueOnce("no model");
    fireEvent.click(await screen.findByText("Adicionar voz"));
    expect(await screen.findByText("Falha ao cadastrar a voz")).toBeTruthy();
  });

  test("renames a voice, skipping a blank or unchanged label", async () => {
    voices = [voiceOf("v1", "Gui")];
    open();
    const rename = await screen.findByText("Renomear");
    promptReply = "Gui";
    fireEvent.click(rename);
    promptReply = "";
    fireEvent.click(rename);
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);

    promptReply = "Celular";
    fireEvent.click(rename);
    expect(await screen.findByText("Voz renomeada")).toBeTruthy();
    expect(await screen.findByText("Celular")).toBeTruthy();
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({
      path: "/api/assistant/voice-profiles/v1",
      body: { label: "Celular" },
    });
  });

  test("reports a failed rename", async () => {
    voices = [voiceOf("v1", "Gui")];
    writeReply = fail(500);
    open();
    promptReply = "Celular";
    fireEvent.click(await screen.findByText("Renomear"));
    expect(await screen.findByText("Falha ao renomear a voz")).toBeTruthy();
  });

  test("removes a voice", async () => {
    voices = [voiceOf("v1", "Gui")];
    open();
    fireEvent.click(await screen.findByText("Remover"));
    expect(await screen.findByText("Voz removida")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Gui")).toBeNull());
    expect(calls.find((c) => c.method === "DELETE")?.path).toBe(
      "/api/assistant/voice-profiles/v1",
    );
  });

  test("reports a failed removal", async () => {
    voices = [voiceOf("v1", "Gui")];
    writeReply = fail(500);
    open();
    fireEvent.click(await screen.findByText("Remover"));
    expect(await screen.findByText("Falha ao remover a voz")).toBeTruthy();
  });
});
