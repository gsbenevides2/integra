import React, { useEffect, useState } from "react";

import { Button } from "@public/components/Button";
import { Modal } from "@public/components/Modal";
import { Select } from "@public/components/Select";
import { useToast } from "@public/components/Toast";

import { getTuyaEdenClient } from "../../client";
import type { Device, Preset } from "../../types";

interface Props {
  preset: Preset | null;
  devices: Device[];
  onClose: () => void;
}

export function ApplyPresetModal({ preset, devices, onClose }: Props) {
  const { showToast } = useToast();
  const [deviceId, setDeviceId] = useState("");
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => setDeviceId(devices[0]?.id ?? ""), [preset, devices]);

  const apply = async () => {
    if (!preset || !deviceId) return;
    setIsApplying(true);
    const { error } = await getTuyaEdenClient()
      .api.tuya.presets({ id: preset.id })
      .apply.post({ deviceId });
    setIsApplying(false);
    if (error) {
      showToast(`Falha ao aplicar "${preset.name}"`, "error");
      return;
    }
    showToast(`"${preset.name}" aplicado`, "success");
    onClose();
  };

  return (
    <Modal
      isOpen={!!preset}
      onClose={onClose}
      title={`Aplicar "${preset?.name ?? ""}"`}
    >
      <Select
        label="Lâmpada"
        value={deviceId}
        onChange={(e) => setDeviceId(e.target.value)}
        options={devices.map((device) => ({
          label: device.name,
          value: device.id,
        }))}
        placeholder={
          devices.length === 0 ? "Nenhuma lâmpada cadastrada" : undefined
        }
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={apply} isLoading={isApplying} disabled={!deviceId}>
          Aplicar
        </Button>
      </div>
    </Modal>
  );
}
