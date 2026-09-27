import React, { useCallback, useEffect, useState } from "react";

import { Button } from "@public/components/Button";
import { useConfirm } from "@public/components/ConfirmContext";
import { Input } from "@public/components/Input";
import { Switch } from "@public/components/Switch";
import { useToast } from "@public/components/Toast";

import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";

import { getTplinkEdenClient } from "../../client";
import { DeviceHistoryChart } from "../DeviceHistoryChart";

interface Interface {
  id: string;
  name: string;
  mac: string;
  ip: string;
  deviceId: string;
  reservedIp: boolean;
  allowList: boolean;
}

interface Device {
  id: string;
  name: string;
  brand: string;
  type: "router" | "client";
  isController: boolean;
  interfaces: Interface[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function NewInterfaceForm({ deviceId, onCreated }: { deviceId: string; onCreated: () => void }) {
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [mac, setMac] = useState("");
  const [ip, setIp] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const submit = useCallback(async () => {
    if (!name || !mac || !ip) {
      showToast("Preencha nome, MAC e IP", "error");
      return;
    }
    setIsSaving(true);
    const client = getTplinkEdenClient();
    const { error } = await client.api.tplink
      .devices({ id: deviceId })
      .interface.post({ name, mac, ip });
    setIsSaving(false);
    if (error) {
      showToast("Falha ao criar interface", "error");
      return;
    }
    setName("");
    setMac("");
    setIp("");
    onCreated();
  }, [name, mac, ip, deviceId, onCreated, showToast]);

  return (
    <div className="flex flex-col gap-2 rounded-md bg-gray-800/60 p-3">
      <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
      <Input label="MAC" value={mac} onChange={(e) => setMac(e.target.value)} />
      <Input label="IP" value={ip} onChange={(e) => setIp(e.target.value)} />
      <Button onClick={submit} isLoading={isSaving}>
        <PlusIcon className="size-4" /> Adicionar interface
      </Button>
    </div>
  );
}

function InterfaceRow({
  iface,
  device,
  onChanged,
}: {
  iface: Interface;
  device: Device;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const isControllerRouter = device.type === "router" && device.isController;

  const toggleFlag = useCallback(
    async (field: "reservedIp" | "allowList", value: boolean) => {
      const client = getTplinkEdenClient();
      const { error } = await client.api.tplink
        .devices({ id: device.id })
        .interface({ interfaceId: iface.id })
        .put({ [field]: value });
      if (error) {
        showToast("Falha ao atualizar interface", "error");
        return;
      }
      onChanged();
    },
    [device.id, iface.id, onChanged, showToast],
  );

  const removeInterface = useCallback(async () => {
    const ok = await confirm({ message: `Remover a interface "${iface.name}"?` });
    if (!ok) return;
    const client = getTplinkEdenClient();
    const { error } = await client.api.tplink
      .devices({ id: device.id })
      .interface({ interfaceId: iface.id })
      .delete();
    if (error) {
      showToast("Falha ao remover interface", "error");
      return;
    }
    onChanged();
  }, [device.id, iface.id, iface.name, confirm, onChanged, showToast]);

  return (
    <div className="flex flex-col gap-2 rounded-md bg-gray-800/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{iface.name}</span>
        {!isControllerRouter && (
          <button
            type="button"
            onClick={removeInterface}
            className="
              cursor-pointer rounded-full p-1 text-red-400 transition-colors
              hover:bg-red-900/40
            "
          >
            <TrashIcon className="size-4" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-mist-400">
        <span>
          MAC <span className="font-mono text-mist-200">{iface.mac}</span>
        </span>
        <span>
          IP <span className="font-mono text-mist-200">{iface.ip}</span>
        </span>
      </div>
      {isControllerRouter ? (
        <p className="text-xs text-mist-500">Interface do controller não pode ser editada.</p>
      ) : (
        <div className="flex flex-wrap gap-4 pt-1">
          <Switch checked={iface.reservedIp} onChange={(v) => toggleFlag("reservedIp", v)} label="IP fixo" />
          <Switch checked={iface.allowList} onChange={(v) => toggleFlag("allowList", v)} label="Permitido" />
        </div>
      )}
    </div>
  );
}

export function DeviceDrawerContent({
  device,
  onChanged,
}: {
  device: Device;
  onChanged: () => void;
}) {
  const [history, setHistory] = useState<
    { checkId: string; createdAt: number; online: boolean }[] | null
  >(null);

  useEffect(() => {
    setHistory(null);
    const client = getTplinkEdenClient();
    client.api.tplink
      .devices({ id: device.id })
      .history.get({ query: { from: String(Date.now() - DAY_MS), to: String(Date.now()) } })
      .then(({ data }) =>
        setHistory((data as { checkId: string; createdAt: number; online: boolean }[]) ?? []),
      );
  }, [device.id]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-mist-400">Marca:</span> <span>{device.brand}</span>
        <span className="ml-4 text-mist-400">Tipo:</span>{" "}
        <span>{device.type === "router" ? "Roteador" : "Cliente"}</span>
        {device.isController && (
          <span className="rounded-full bg-mist-900 px-2 py-0.5 text-xs">Controller</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-mist-300">Interfaces</h3>
        <div className="flex flex-col gap-2">
          {device.interfaces.map((iface) => (
            <InterfaceRow key={iface.id} iface={iface} device={device} onChanged={onChanged} />
          ))}
          {device.interfaces.length === 0 && (
            <p className="text-sm text-mist-400">Nenhuma interface cadastrada.</p>
          )}
        </div>
        {(device.type !== "router" || device.interfaces.length === 0) && (
          <NewInterfaceForm deviceId={device.id} onCreated={onChanged} />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-mist-300">Histórico de conexão (24h)</h3>
        {history === null ? (
          <p className="text-sm text-mist-400">Carregando histórico...</p>
        ) : (
          <DeviceHistoryChart history={history} />
        )}
      </div>
    </>
  );
}
