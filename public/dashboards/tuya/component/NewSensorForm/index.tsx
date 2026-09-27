import React, { useCallback, useState } from "react";

import { Button } from "@public/components/Button";
import { Input } from "@public/components/Input";
import { Modal } from "@public/components/Modal";
import { useToast } from "@public/components/ToastContext";

import { EMPTY_SENSOR_DRAFT, NewSensorDraft } from "../..";
import { getTuyaEdenClient } from "../../client";

export function NewSensorForm({
  isOpen,
  onCreated,
  onClose,
}: {
  isOpen: boolean;
  onCreated: () => void;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<NewSensorDraft>(EMPTY_SENSOR_DRAFT);
  const [isSaving, setIsSaving] = useState(false);

  const submit = useCallback(async () => {
    if (!draft.name || !draft.tuyaDeviceId) {
      showToast("Preencha nome e device ID", "error");
      return;
    }
    setIsSaving(true);
    const { error } = await getTuyaEdenClient().api.tuya.sensors.post(draft);
    setIsSaving(false);
    if (error) {
      showToast("Falha ao cadastrar o sensor", "error");
      return;
    }
    showToast("Sensor cadastrado", "success");
    setDraft(EMPTY_SENSOR_DRAFT);
    onCreated();
    onClose();
  }, [draft, showToast, onCreated, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Novo sensor">
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
