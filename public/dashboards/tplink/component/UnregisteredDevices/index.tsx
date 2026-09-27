import React, { useCallback, useMemo, useState } from "react";

import { Button } from "@public/components/Button";
import { Input } from "@public/components/Input";
import { Modal } from "@public/components/Modal";
import { Select } from "@public/components/Select";
import { useToast } from "@public/components/Toast";

import { LinkIcon, PlusIcon } from "@heroicons/react/24/outline";

import { getTplinkEdenClient } from "../../client";

interface OnlineDevice {
  mac: string;
  ip: string;
  vendor: string;
  name: string;
  routerInterface: string;
}

interface Device {
  id: string;
  name: string;
  brand: string;
  interfaces: { mac: string }[];
}

interface Props {
  onlineDevices: OnlineDevice[];
  devices: Device[];
  onChanged: () => void;
}

export function UnregisteredDevices({ onlineDevices, devices, onChanged }: Props) {
  const { showToast } = useToast();
  const [linkTarget, setLinkTarget] = useState<OnlineDevice | null>(null);
  const [createTarget, setCreateTarget] = useState<OnlineDevice | null>(null);
  const [interfaceName, setInterfaceName] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [deviceBrand, setDeviceBrand] = useState("");
  const [ip, setIp] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const registeredMacs = useMemo(() => {
    const macs = new Set<string>();
    for (const device of devices) {
      for (const iface of device.interfaces) {
        macs.add(iface.mac.toUpperCase());
      }
    }
    return macs;
  }, [devices]);

  const unregistered = useMemo(
    () => onlineDevices.filter((d) => !registeredMacs.has(d.mac.toUpperCase())),
    [onlineDevices, registeredMacs],
  );

  const openLink = useCallback((device: OnlineDevice) => {
    setLinkTarget(device);
    setSelectedDeviceId("");
    setInterfaceName("");
    setIp(device.ip);
  }, []);

  const openCreate = useCallback((device: OnlineDevice) => {
    setCreateTarget(device);
    setDeviceName(device.name !== "Unknown" ? device.name : "");
    setDeviceBrand(device.vendor !== "Unknown" ? device.vendor : "");
    setInterfaceName("");
    setIp(device.ip);
  }, []);

  const submitLink = useCallback(async () => {
    if (!linkTarget || !selectedDeviceId || !interfaceName || !ip) {
      showToast("Selecione o dispositivo e informe nome da interface e IP", "error");
      return;
    }
    setIsSaving(true);
    const client = getTplinkEdenClient();
    const { error } = await client.api.tplink
      .devices({ id: selectedDeviceId })
      .interface.post({ name: interfaceName, mac: linkTarget.mac, ip });
    setIsSaving(false);
    if (error) {
      showToast("Falha ao vincular interface", "error");
      return;
    }
    showToast("Interface vinculada", "success");
    setLinkTarget(null);
    onChanged();
  }, [linkTarget, selectedDeviceId, interfaceName, ip, onChanged, showToast]);

  const submitCreate = useCallback(async () => {
    if (!createTarget || !deviceName || !deviceBrand || !interfaceName || !ip) {
      showToast("Preencha nome, marca, nome da interface e IP", "error");
      return;
    }
    setIsSaving(true);
    const client = getTplinkEdenClient();
    const { data, error } = await client.api.tplink.devices.post({
      name: deviceName,
      brand: deviceBrand,
      type: "client",
    });
    if (error || !data) {
      setIsSaving(false);
      showToast("Falha ao criar dispositivo", "error");
      return;
    }
    const { error: interfaceError } = await client.api.tplink
      .devices({ id: (data as { id: string }).id })
      .interface.post({ name: interfaceName, mac: createTarget.mac, ip });
    setIsSaving(false);
    if (interfaceError) {
      showToast("Dispositivo criado, mas falhou ao adicionar a interface", "error");
      return;
    }
    showToast("Dispositivo criado e vinculado", "success");
    setCreateTarget(null);
    onChanged();
  }, [createTarget, deviceName, deviceBrand, interfaceName, ip, onChanged, showToast]);

  if (unregistered.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-mist-300">
        Dispositivos não registrados ({unregistered.length})
      </h2>
      <div className="overflow-x-auto rounded-md bg-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="
              border-b border-gray-700 text-left text-xs text-mist-400
            ">
              <th className="px-3 py-2 font-normal">Nome</th>
              <th className="px-3 py-2 font-normal">Fabricante</th>
              <th className="px-3 py-2 font-normal">MAC</th>
              <th className="px-3 py-2 font-normal">IP</th>
              <th className="px-3 py-2 font-normal">Roteador</th>
              <th className="px-3 py-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {unregistered.map((device) => (
              <tr key={device.mac} className="
                border-b border-gray-700
                last:border-0
              ">
                <td className="px-3 py-2">{device.name}</td>
                <td className="px-3 py-2 text-mist-300">{device.vendor}</td>
                <td className="px-3 py-2 font-mono text-xs">{device.mac}</td>
                <td className="px-3 py-2 font-mono text-xs">{device.ip || "-"}</td>
                <td className="px-3 py-2 text-xs text-mist-400">{device.routerInterface || "-"}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button variant="secondary" onClick={() => openLink(device)}>
                      <LinkIcon className="size-3.5" /> Vincular
                    </Button>
                    <Button variant="secondary" onClick={() => openCreate(device)}>
                      <PlusIcon className="size-3.5" /> Criar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!linkTarget}
        onClose={() => setLinkTarget(null)}
        title="Vincular a dispositivo existente"
      >
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-xs text-mist-400">
            MAC <span className="font-mono">{linkTarget?.mac}</span>
          </p>
          <Select
            label="Dispositivo"
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            placeholder="Selecione um dispositivo"
            options={devices.map((d) => ({ label: `${d.name} (${d.brand})`, value: d.id }))}
          />
          <Input
            label="Nome da interface"
            placeholder="Ex: Wi-Fi, Ethernet..."
            value={interfaceName}
            onChange={(e) => setInterfaceName(e.target.value)}
          />
          <Input
            label="IP"
            placeholder="Ex: 192.168.0.10"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setLinkTarget(null)}>
            Cancelar
          </Button>
          <Button onClick={submitLink} isLoading={isSaving}>
            Vincular
          </Button>
        </div>
      </Modal>

      <Modal isOpen={!!createTarget} onClose={() => setCreateTarget(null)} title="Criar novo dispositivo">
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-xs text-mist-400">
            MAC <span className="font-mono">{createTarget?.mac}</span>
          </p>
          <Input label="Nome" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
          <Input label="Marca" value={deviceBrand} onChange={(e) => setDeviceBrand(e.target.value)} />
          <Input
            label="Nome da interface"
            placeholder="Ex: Wi-Fi, Ethernet..."
            value={interfaceName}
            onChange={(e) => setInterfaceName(e.target.value)}
          />
          <Input
            label="IP"
            placeholder="Ex: 192.168.0.10"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCreateTarget(null)}>
            Cancelar
          </Button>
          <Button onClick={submitCreate} isLoading={isSaving}>
            Criar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
