import React, { useEffect, useState } from "react";

import { Button } from "@public/components/Button";
import { Modal } from "@public/components/Modal";
import { useToast } from "@public/components/Toast";

import { getAssistantEdenClient } from "./client";

/** Mirrors MAX_EXTRA_INSTRUCTIONS_LENGTH on the server. */
export const MAX_EXTRA_INSTRUCTIONS_LENGTH = 4000;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/** The user's own instructions for the assistant, only for them. */
export function SettingsModal({ isOpen, onClose }: Props) {
  const { showToast } = useToast();
  const [instructions, setInstructions] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setIsLoading(true);
    void getAssistantEdenClient().api.assistant.settings.get().then((settings) => {
      if (!active) return;
      if (settings.error || !settings.data) {
        showToast("Falha ao carregar suas preferências", "error");
      } else {
        setInstructions(settings.data.extraInstructions);
      }
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [isOpen, showToast]);

  const save = async () => {
    setIsSaving(true);
    const { error } = await getAssistantEdenClient().api.assistant.settings.put({
      extraInstructions: instructions,
    });
    setIsSaving(false);
    if (error) {
      showToast("Falha ao salvar suas preferências", "error");
      return;
    }
    showToast("Preferências salvas", "success");
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Minhas preferências">
      <div className="flex flex-col gap-3">
        <label htmlFor="assistant-instructions" className="
          text-xs text-mist-300
        ">
          Instruções para a Integra (só valem para você)
        </label>
        <textarea
          id="assistant-instructions"
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          disabled={isLoading}
          maxLength={MAX_EXTRA_INSTRUCTIONS_LENGTH}
          rows={6}
          placeholder="Ex.: Me chame de Gui. Responda de forma bem curta."
          className="
            rounded-md border border-mist-600 bg-gray-900 p-2 text-sm outline-0
            focus:border-mist-300
          "
        />
        <p className="text-[11px] text-mist-500">
          {instructions.length}/{MAX_EXTRA_INSTRUCTIONS_LENGTH} caracteres. Vale
          a partir da próxima mensagem.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} isLoading={isSaving} disabled={isLoading}>
            Salvar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
