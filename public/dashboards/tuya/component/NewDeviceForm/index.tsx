import React, { useCallback, useState } from "react";

import { Button } from "@public/components/Button";
import { Input } from "@public/components/Input";
import { Modal } from "@public/components/Modal";
import { Select } from "@public/components/Select";
import { useToast } from "@public/components/ToastContext";

import { EMPTY_DEVICE_DRAFT, NewDeviceDraft } from "../..";
import { getTuyaEdenClient } from "../../client";
import type { DeviceKind } from "../../types";

export function NewDeviceForm({
  isOpen,
  onCreated,
  onClose,
}: {
  isOpen: boolean;
  onCreated: () => void;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<NewDeviceDraft>(EMPTY_DEVICE_DRAFT);
  const [isSaving, setIsSaving] = useState(false);

  const submit = useCallback(async () => {
    if (!draft.name || !draft.tuyaDeviceId) {
      showToast("Preencha nome e device ID", "error");
      return;
    }
    setIsSaving(true);
    const { error } = await getTuyaEdenClient().api.tuya.devices.post({
      name: draft.name,
      tuyaDeviceId: draft.tuyaDeviceId,
      kind: draft.kind,
      channelCount: draft.channelCount ? Number(draft.channelCount) : null,
    });
    setIsSaving(false);
    if (error) {
      showToast("Falha ao cadastrar o dispositivo", "error");
      return;
    }
    showToast("Dispositivo cadastrado", "success");
    setDraft(EMPTY_DEVICE_DRAFT);
    onCreated();
    onClose();
  }, [draft, showToast, onCreated, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Novo dispositivo">
      <div className="flex flex-col gap-2">
        <Input
          label="Nome"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <Input
          label="Device ID (Tuya)"
          value={draft.tuyaDeviceId}
          onChange={(e) => setDraft({ ...draft, tuyaDeviceId: e.target.value })}
        />
        <Select
          label="Tipo"
          value={draft.kind}
          onChange={(e) =>
            setDraft({ ...draft, kind: e.target.value as DeviceKind })
          }
          options={[
            { label: "Lâmpada", value: "lamp" },
            { label: "Interruptor", value: "switch" },
          ]}
        />
        {draft.kind === "switch" && (
          <Input
            label="Quantidade de canais"
            value={draft.channelCount}
            onChange={(e) =>
              setDraft({ ...draft, channelCount: e.target.value })
            }
          />
        )}
      </div>
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
