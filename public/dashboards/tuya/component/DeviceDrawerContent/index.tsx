import React, { useCallback, useEffect, useState } from "react";

import { Button } from "@public/components/Button";
import { useConfirm } from "@public/components/ConfirmContext";
import { Input } from "@public/components/Input";
import { Switch } from "@public/components/Switch";
import { useToast } from "@public/components/Toast";

import { TrashIcon } from "@heroicons/react/24/outline";

import { getTuyaEdenClient } from "../../client";
import type { Device, DeviceCommand, HistoryPoint } from "../../types";
import { DeviceHistoryChart } from "./DeviceHistoryChart";
import { LampControls } from "./LampControls";
import { SwitchControls } from "./SwitchControls";

interface Props {
  device: Device;
  isBusy: boolean;
  onCommand: (command: DeviceCommand) => void;
  onChanged: () => void;
  onDeleted: () => void;
}

export function DeviceDrawerContent({
  device,
  isBusy,
  onCommand,
  onChanged,
  onDeleted,
}: Props) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [name, setName] = useState(device.name);
  const [isSaving, setIsSaving] = useState(false);
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    setName(device.name);
  }, [device.id, device.name]);

  useEffect(() => {
    let cancelled = false;
    const client = getTuyaEdenClient();
    client.api.tuya
      .devices({ id: device.id })
      .history.get({ query: {} })
      .then(({ data }) => {
        if (cancelled || !data) return;
        setHistory(
          (data as unknown as { snapshots: HistoryPoint[] }).snapshots ?? [],
        );
      });
    return () => {
      cancelled = true;
    };
  }, [device.id]);

  const save = useCallback(async () => {
    setIsSaving(true);
    const client = getTuyaEdenClient();
    const { error } = await client.api.tuya
      .devices({ id: device.id })
      .put({ name });
    setIsSaving(false);
    if (error) {
      showToast("Falha ao salvar o dispositivo", "error");
      return;
    }
    showToast("Dispositivo salvo", "success");
    onChanged();
  }, [device.id, name, showToast, onChanged]);

  const remove = useCallback(async () => {
    const ok = await confirm({
      title: "Remover dispositivo",
      message: `Remover "${device.name}"? O histórico dele também será apagado.`,
    });
    if (!ok) return;
    const client = getTuyaEdenClient();
    const { error } = await client.api.tuya.devices({ id: device.id }).delete();
    if (error) {
      showToast("Falha ao remover o dispositivo", "error");
      return;
    }
    showToast("Dispositivo removido", "success");
    onDeleted();
  }, [confirm, device.id, device.name, showToast, onDeleted]);

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3">
        {device.kind === "switch" ? (
          <SwitchControls
            device={device}
            isBusy={isBusy}
            onCommand={onCommand}
          />
        ) : (
          <LampControls device={device} isBusy={isBusy} onCommand={onCommand} />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-mist-300">Configuração</h3>
        <Input
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Switch
          checked={device.hidden}
          onChange={async (hidden) => {
            const { error } = await getTuyaEdenClient()
              .api.tuya.devices({ id: device.id })
              .put({ hidden });
            if (error) {
              showToast("Falha ao alterar a visibilidade", "error");
              return;
            }
            onChanged();
          }}
          label={device.hidden ? "Oculta no painel" : "Visível no painel"}
        />
        <p className="text-xs text-mist-400">
          Ocultar tira o dispositivo do painel sem parar o controle nem o
          histórico.
        </p>
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-mist-400">
          <div>
            <dt className="inline">Device ID: </dt>
            <dd className="inline font-mono">{device.tuyaDeviceId}</dd>
          </div>
          <div>
            <dt className="inline">Tipo: </dt>
            <dd className="inline">
              {device.kind === "lamp" ? "Lâmpada" : "Interruptor"}
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} isLoading={isSaving}>
            Salvar
          </Button>
          <Button variant="secondary" onClick={remove}>
            <TrashIcon className="size-4" /> Remover
          </Button>
        </div>
      </section>

      {history.length > 0 && <DeviceHistoryChart data={history} />}
    </div>
  );
}
