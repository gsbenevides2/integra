import React from "react";

import type { Me } from "@public/components/MeContext";

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";

import { fail, useApi } from "../../../helpers/dash-api";
import { ME_FIXTURE, renderWithMe } from "../../../helpers/me";
import { installVoiceFakes } from "../../../helpers/voice";

// No mock.module here: Bun keeps module mocks for every later test file, so the
// real provider and toasts run and the API is faked at fetch level.
afterAll(installVoiceFakes());

const { CHAT_ROUTE_KEY, VoiceAssistantProvider } = await import(
  "@public/components/VoiceAssistantContext"
);
const { SettingsModal } = await import("@public/dashboards/voice-assistant/SettingsModal");

const ALLOWED: Me = { ...ME_FIXTURE, routes: [CHAT_ROUTE_KEY] };

let settings: unknown = { extraInstructions: "Me chame de Gui." };
let saveReply: unknown = { extraInstructions: "" };

const calls = useApi({
  "GET /api/assistant/config": () => ({ wakeWordEnabled: false }),
  "GET /api/assistant/settings": () => settings,
  "PUT /api/assistant/settings": () => saveReply,
});

afterEach(() => {
  settings = { extraInstructions: "Me chame de Gui." };
  saveReply = { extraInstructions: "" };
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

describe("SettingsModal", () => {
  test("saves the instructions", async () => {
    const onClose = mock(() => {});
    open(onClose);
    const textarea = (await screen.findByLabelText(
      "Instruções para a Integra (só valem para você)",
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe("Me chame de Gui."));
    fireEvent.change(textarea, { target: { value: "Fale curto." } });
    fireEvent.click(screen.getByText("Salvar"));
    expect(await screen.findByText("Preferências salvas")).toBeTruthy();
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
      extraInstructions: "Fale curto.",
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
});
