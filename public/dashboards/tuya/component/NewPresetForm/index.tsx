import React, { useCallback, useState } from "react";

import { Button } from "@public/components/Button";
import { Modal } from "@public/components/Modal";
import { useToast } from "@public/components/ToastContext";

import { getTuyaEdenClient } from "../../client";
import {
  EMPTY_PRESET_DRAFT,
  type PresetDraft,
  presetDraftToBody,
  PresetForm,
} from "../PresetForm";

export function NewPresetForm({
  isOpen,
  onCreated,
  onClose,
}: {
  isOpen: boolean;
  onCreated: () => void;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<PresetDraft>(EMPTY_PRESET_DRAFT);
  const [isSaving, setIsSaving] = useState(false);

  const submit = useCallback(async () => {
    if (!draft.name) {
      showToast("Dê um nome ao modo", "error");
      return;
    }
    setIsSaving(true);
    const { error } = await getTuyaEdenClient().api.tuya.presets.post(
      presetDraftToBody(draft),
    );
    setIsSaving(false);
    if (error) {
      showToast("Falha ao cadastrar o modo", "error");
      return;
    }
    showToast("Modo cadastrado", "success");
    setDraft(EMPTY_PRESET_DRAFT);
    onCreated();
    onClose();
  }, [draft, showToast, onCreated, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Novo modo">
      <PresetForm draft={draft} onChange={setDraft} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={submit} isLoading={isSaving}>
          Cadastrar
        </Button>
      </div>
    </Modal>
  );
}
