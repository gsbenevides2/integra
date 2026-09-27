import React, { useCallback, useEffect, useState } from "react";

import { Button } from "@public/components/Button";
import { useConfirm } from "@public/components/ConfirmContext";
import { useToast } from "@public/components/Toast";

import { TrashIcon } from "@heroicons/react/24/outline";

import { getTuyaEdenClient } from "../../client";
import type { Preset } from "../../types";
import {
  type PresetDraft,
  presetDraftFromPreset,
  presetDraftToBody,
  PresetForm,
} from "../PresetForm";

interface Props {
  preset: Preset;
  onChanged: () => void;
  onDeleted: () => void;
}

export function PresetDrawerContent({ preset, onChanged, onDeleted }: Props) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<PresetDraft>(() =>
    presetDraftFromPreset(preset),
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => setDraft(presetDraftFromPreset(preset)), [preset]);

  const save = useCallback(async () => {
    setIsSaving(true);
    const { error } = await getTuyaEdenClient()
      .api.tuya.presets({ id: preset.id })
      .put(presetDraftToBody(draft));
    setIsSaving(false);
    if (error) {
      showToast("Falha ao salvar o modo", "error");
      return;
    }
    showToast("Modo salvo", "success");
    onChanged();
  }, [draft, preset.id, showToast, onChanged]);

  const remove = useCallback(async () => {
    const ok = await confirm({
      title: "Remover modo",
      message: `Remover o modo "${preset.name}"?`,
    });
    if (!ok) return;
    const { error } = await getTuyaEdenClient()
      .api.tuya.presets({ id: preset.id })
      .delete();
    if (error) {
      showToast("Falha ao remover o modo", "error");
      return;
    }
    showToast("Modo removido", "success");
    onDeleted();
  }, [confirm, preset.id, preset.name, showToast, onDeleted]);

  return (
    <div className="flex flex-col gap-4">
      <PresetForm draft={draft} onChange={setDraft} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} isLoading={isSaving}>
          Salvar
        </Button>
        <Button variant="secondary" onClick={remove}>
          <TrashIcon className="size-4" /> Remover
        </Button>
      </div>
    </div>
  );
}
