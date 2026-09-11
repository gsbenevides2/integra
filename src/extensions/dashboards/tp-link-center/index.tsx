import { useCallback, useEffect, useState } from "react";
import {
    ArrowPathIcon,
    PlusIcon,
    PowerIcon,
    TrashIcon,
    WifiIcon,
} from "@heroicons/react/24/outline";
import type { DashboardData } from "core/ui/createDashboard";
import { Button } from "core/ui/components/button";
import { useConfirm } from "core/ui/components/confirm/context";
import { Drawer } from "core/ui/components/drawer";
import { Input } from "core/ui/components/input";
import { Select } from "core/ui/components/select";
import { useToast } from "core/ui/components/toast";
import { getTpLinkCenterEdenClient } from "extensions/scripts/tp-link-center/client";
import { DeviceDrawerContent } from "./component/deviceDrawerContent";
import { Modal } from "./component/modal";
import { RouterStatusChart } from "./component/routerStatusChart";
import { RouterStatusPanel } from "./component/routerStatusPanel";
import { UnregisteredDevices } from "./component/unregisteredDevices";

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

interface RouterStatus {
    wanIp: string;
    connectionStatus: string;
    connectionUptime: string;
    routerUptime: string;
    firmwareVersion: string;
    hardwareVersion: string;
    cpuUsage: number | null;
    memoryUsage: number | null;
    totalDownload: string | null;
    totalUpload: string | null;
}

interface RouterStatusHistoryPoint {
    id: string;
    cpuUsage: number | null;
    memoryUsage: number | null;
    connectionStatus: string;
    collectedAt: string;
}

interface OnlineDevice {
    mac: string;
    ip: string;
    vendor: string;
    name: string;
    routerInterface: string;
}

function deviceSortOrder(device: Device): number {
    if (device.type === "router" && device.isController) return 0;
    if (device.type === "router") return 1;
    return 2;
}

function NewDeviceForm({
    isOpen,
    onCreated,
    onClose,
}: {
    isOpen: boolean;
    onCreated: () => void;
    onClose: () => void;
}) {
    const { showToast } = useToast();
    const [name, setName] = useState("");
    const [brand, setBrand] = useState("");
    const [type, setType] = useState<"router" | "client">("client");
    const [isController, setIsController] = useState(false);
    const [routerPassword, setRouterPassword] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const submit = useCallback(async () => {
        if (!name || !brand) {
            showToast("Preencha nome e marca", "error");
            return;
        }
        setIsSaving(true);
        const client = getTpLinkCenterEdenClient();
        const { error } = await client["tp-link-center"].devices.post({
            name,
            brand,
            type,
            isController: type === "router" ? isController : undefined,
            routerPassword: type === "router" && routerPassword ? routerPassword : undefined,
        });
        setIsSaving(false);
        if (error) {
            showToast("Falha ao criar dispositivo", "error");
            return;
        }
        showToast("Dispositivo criado", "success");
        setName("");
        setBrand("");
        setRouterPassword("");
        setIsController(false);
        onCreated();
        onClose();
    }, [name, brand, type, isController, routerPassword, onCreated, onClose, showToast]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Novo dispositivo">
            <div className="flex flex-col gap-2">
                <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
                <Input label="Marca" value={brand} onChange={(e) => setBrand(e.target.value)} />
                <Select
                    label="Tipo"
                    value={type}
                    onChange={(e) => setType(e.target.value as "router" | "client")}
                    options={[
                        { label: "Cliente", value: "client" },
                        { label: "Roteador", value: "router" },
                    ]}
                />
                {type === "router" && (
                    <Input
                        label="Senha de admin do roteador"
                        type="password"
                        value={routerPassword}
                        onChange={(e) => setRouterPassword(e.target.value)}
                    />
                )}
                {type === "router" && (
                    <label className="flex items-center gap-2 text-xs text-mist-300">
                        <input
                            type="checkbox"
                            checked={isController}
                            onChange={(e) => setIsController(e.target.checked)}
                        />
                        Este roteador é o controller
                    </label>
                )}
            </div>
            <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={onClose}>
                    Cancelar
                </Button>
                <Button onClick={submit} isLoading={isSaving}>
                    Criar
                </Button>
            </div>
        </Modal>
    );
}

function Dashboard() {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [devices, setDevices] = useState<Device[]>([]);
    const [onlineDevices, setOnlineDevices] = useState<OnlineDevice[]>([]);
    const [routerStatus, setRouterStatus] = useState<RouterStatus | null>(null);
    const [routerStatusHistory, setRouterStatusHistory] = useState<RouterStatusHistoryPoint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [showNewDeviceForm, setShowNewDeviceForm] = useState(false);
    const [openDeviceId, setOpenDeviceId] = useState<string | null>(null);

    const fetchAll = useCallback(async (useLoading: boolean) => {
        if (useLoading) setIsLoading(true);
        const client = getTpLinkCenterEdenClient();
        const [devicesRes, statusRes, checkRes, statusHistoryRes] = await Promise.all([
            client["tp-link-center"].devices.get(),
            client["tp-link-center"].settings["latest-router-status"].get(),
            client["tp-link-center"].checks.latest.get(),
            client["tp-link-center"].settings["router-status-history"].get({ query: {} }),
        ]);
        if (devicesRes.data) setDevices(devicesRes.data as unknown as Device[]);
        if (statusRes.data) setRouterStatus(statusRes.data as unknown as RouterStatus);
        if (checkRes.data)
            setOnlineDevices((checkRes.data as { devices: OnlineDevice[] }).devices ?? []);
        if (statusHistoryRes.data)
            setRouterStatusHistory(
                (statusHistoryRes.data as unknown as { snapshots: RouterStatusHistoryPoint[] })
                    .snapshots ?? [],
            );
        if (useLoading) setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchAll(true);
        const interval = setInterval(() => fetchAll(false), 15000);
        return () => clearInterval(interval);
    }, [fetchAll]);

    const onlineMacs = new Set(onlineDevices.map((d) => d.mac.toUpperCase()));

    function isDeviceOnline(device: Device) {
        return device.interfaces.some((iface) => onlineMacs.has(iface.mac.toUpperCase()));
    }

    const sync = useCallback(async () => {
        setIsSyncing(true);
        const client = getTpLinkCenterEdenClient();
        const { error } = await client["tp-link-center"].router.sync.post();
        setIsSyncing(false);
        if (error) {
            showToast("Falha ao sincronizar com o roteador", "error");
            return;
        }
        showToast("Sincronização concluída", "success");
        fetchAll(false);
    }, [fetchAll, showToast]);

    const restartNetwork = useCallback(async () => {
        const ok = await confirm({
            title: "Reiniciar rede",
            message: "Isso vai reiniciar todos os roteadores (agentes e controller). Continuar?",
        });
        if (!ok) return;
        const client = getTpLinkCenterEdenClient();
        const { error } = await client["tp-link-center"].router["restart-network"].post();
        if (error) {
            showToast("Falha ao reiniciar a rede", "error");
            return;
        }
        showToast("Reinício disparado", "success");
    }, [confirm, showToast]);

    const removeDevice = useCallback(
        async (device: Device) => {
            const ok = await confirm({ message: `Remover o dispositivo "${device.name}"?` });
            if (!ok) return;
            const client = getTpLinkCenterEdenClient();
            const { error } = await client["tp-link-center"].devices({ id: device.id }).delete();
            if (error) {
                showToast("Falha ao remover dispositivo", "error");
                return;
            }
            fetchAll(false);
        },
        [confirm, fetchAll, showToast],
    );

    const openDevice = devices.find((d) => d.id === openDeviceId) ?? null;
    const sortedDevices = [...devices].sort((a, b) => deviceSortOrder(a) - deviceSortOrder(b));

    return (
        <div className="p-3 flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <h1 className="text-xl">TP-Link Center</h1>
                <div className="flex items-center gap-2">
                    <Button onClick={sync} isLoading={isSyncing}>
                        <ArrowPathIcon className="size-4" /> Sincronizar
                    </Button>
                    <Button variant="secondary" onClick={restartNetwork}>
                        <PowerIcon className="size-4" /> Reiniciar rede
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <p className="text-sm text-mist-400">Carregando...</p>
            ) : (
                <>
                    <RouterStatusPanel status={routerStatus} />

                    {routerStatusHistory.length > 0 && (
                        <RouterStatusChart data={routerStatusHistory} />
                    )}

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-mist-300">
                                Dispositivos registrados ({devices.length})
                            </h2>
                            <Button variant="secondary" onClick={() => setShowNewDeviceForm(true)}>
                                <PlusIcon className="size-4" /> Novo dispositivo
                            </Button>
                        </div>

                        <NewDeviceForm
                            isOpen={showNewDeviceForm}
                            onCreated={() => fetchAll(false)}
                            onClose={() => setShowNewDeviceForm(false)}
                        />

                        <div className="bg-gray-800 rounded-md overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs text-mist-400 border-b border-gray-700">
                                        <th className="font-normal py-2 px-3">Nome</th>
                                        <th className="font-normal py-2 px-3">Marca</th>
                                        <th className="font-normal py-2 px-3">Tipo</th>
                                        <th className="font-normal py-2 px-3">Status</th>
                                        <th className="font-normal py-2 px-3" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedDevices.map((device) => (
                                        <tr
                                            key={device.id}
                                            className="border-b border-gray-700 last:border-0 hover:bg-gray-700/40 cursor-pointer"
                                            onClick={() => setOpenDeviceId(device.id)}
                                        >
                                            <td className="py-2 px-3 flex items-center gap-2">
                                                <WifiIcon className="size-4 text-mist-400 shrink-0" />
                                                {device.name}
                                            </td>
                                            <td className="py-2 px-3 text-mist-300">
                                                {device.brand}
                                            </td>
                                            <td className="py-2 px-3">
                                                {device.type === "router"
                                                    ? device.isController
                                                        ? "Roteador (Controller)"
                                                        : "Roteador (Agente)"
                                                    : "Cliente"}
                                            </td>
                                            <td className="py-2 px-3">
                                                <span
                                                    className={`text-xs rounded-full px-2 py-0.5 ${
                                                        isDeviceOnline(device)
                                                            ? "bg-green-900 text-green-300"
                                                            : "bg-red-950 text-red-300"
                                                    }`}
                                                >
                                                    {isDeviceOnline(device)
                                                        ? "Conectado"
                                                        : "Desconectado"}
                                                </span>
                                            </td>
                                            <td className="py-2 px-3">
                                                <div className="flex justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            removeDevice(device);
                                                        }}
                                                        className="cursor-pointer p-1 rounded-full hover:bg-red-900/40 text-red-400 transition-colors"
                                                    >
                                                        <TrashIcon className="size-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {devices.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="py-3 px-3 text-mist-400 text-sm"
                                            >
                                                Nenhum dispositivo cadastrado.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <UnregisteredDevices
                        onlineDevices={onlineDevices}
                        devices={devices}
                        onChanged={() => fetchAll(false)}
                    />
                </>
            )}

            <Drawer
                isOpen={!!openDevice}
                onClose={() => setOpenDeviceId(null)}
                title={openDevice?.name}
            >
                {openDevice && (
                    <DeviceDrawerContent device={openDevice} onChanged={() => fetchAll(false)} />
                )}
            </Drawer>
        </div>
    );
}

export const tpLinkCenterDashboard: DashboardData = {
    id: "tp-link-center",
    content: Dashboard,
    icon: WifiIcon,
    name: "TP-Link Center",
};
