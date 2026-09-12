import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowPathIcon, HomeIcon, PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "core/ui/components/button";
import { Drawer } from "core/ui/components/drawer";
import { Input } from "core/ui/components/input";
import { useToast } from "core/ui/components/toast";
import type { DashboardData } from "core/ui/createDashboard";
import { getTuyaEdenClient } from "extensions/scripts/tuya/client";
import { DiscoveredLamps } from "./component/discoveredLamps";
import { DeviceCard } from "./component/deviceCard";
import { DeviceDrawerContent } from "./component/deviceDrawerContent";
import { Modal } from "./component/modal";
import { SensorCard } from "./component/sensorCard";
import { SensorDrawerContent } from "./component/sensorDrawerContent";
import type { DiscoveredDevice, Device, DeviceCommand, DeviceState, Sensor } from "./types";

const POLL_INTERVAL_MS = 5000;

interface NewLampDraft {
    name: string;
    tuyaDeviceId: string;
    localKey: string;
    ip: string;
}

const EMPTY_DRAFT: NewLampDraft = { name: "", tuyaDeviceId: "", localKey: "", ip: "" };

function NewLampForm({
    isOpen,
    draft,
    onDraftChange,
    onCreated,
    onClose,
}: {
    isOpen: boolean;
    draft: NewLampDraft;
    onDraftChange: (draft: NewLampDraft) => void;
    onCreated: () => void;
    onClose: () => void;
}) {
    const { showToast } = useToast();
    const [isSaving, setIsSaving] = useState(false);

    const submit = useCallback(async () => {
        if (!draft.name || !draft.tuyaDeviceId || !draft.localKey) {
            showToast("Preencha nome, device ID e localKey", "error");
            return;
        }
        setIsSaving(true);
        const client = getTuyaEdenClient();
        const { error } = await client.tuya.devices.post({
            name: draft.name,
            tuyaDeviceId: draft.tuyaDeviceId,
            localKey: draft.localKey,
            ip: draft.ip || null,
        });
        setIsSaving(false);
        if (error) {
            showToast("Falha ao cadastrar a lâmpada", "error");
            return;
        }
        showToast("Lâmpada cadastrada", "success");
        onCreated();
        onClose();
    }, [draft, showToast, onCreated, onClose]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Nova lâmpada">
            <div className="flex flex-col gap-2">
                <Input
                    label="Nome"
                    value={draft.name}
                    onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
                />
                <Input
                    label="Device ID"
                    value={draft.tuyaDeviceId}
                    onChange={(e) => onDraftChange({ ...draft, tuyaDeviceId: e.target.value })}
                />
                <Input
                    label="localKey"
                    type="password"
                    value={draft.localKey}
                    onChange={(e) => onDraftChange({ ...draft, localKey: e.target.value })}
                />
                <Input
                    label="IP (opcional, descoberto automaticamente)"
                    value={draft.ip}
                    onChange={(e) => onDraftChange({ ...draft, ip: e.target.value })}
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

function Dashboard() {
    const { showToast } = useToast();
    const [devices, setLamps] = useState<Device[]>([]);
    const [discovered, setDiscovered] = useState<DiscoveredDevice[]>([]);
    const [sensors, setSensors] = useState<Sensor[]>([]);
    const [openSensorId, setOpenSensorId] = useState<string | null>(null);
    const [isSyncingSensors, setIsSyncingSensors] = useState(false);
    const [showHidden, setShowHidden] = useState(false);
    const [showHiddenDevices, setShowHiddenDevices] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [busyDeviceIds, setBusyDeviceIds] = useState<string[]>([]);
    const [openDeviceId, setOpenDeviceId] = useState<string | null>(null);
    const [showNewLampForm, setShowNewLampForm] = useState(false);
    const [draft, setDraft] = useState<NewLampDraft>(EMPTY_DRAFT);

    // A command is answered by the device itself, so a poll landing mid-flight would
    // overwrite the optimistic value with a reading taken before the change.
    const inFlight = useRef(new Set<string>());

    const fetchAll = useCallback(async (useLoading: boolean) => {
        if (useLoading) setIsLoading(true);
        const client = getTuyaEdenClient();
        const [lampsRes, discoveredRes, sensorsRes] = await Promise.all([
            client.tuya.devices.get({ query: { includeHidden: "true" } }),
            client.tuya.discovered.get(),
            client.tuya.sensors.get({ query: { includeHidden: "true" } }),
        ]);
        if (lampsRes.data) {
            const fresh = lampsRes.data as unknown as Device[];
            setLamps((current) =>
                fresh.map((device) =>
                    inFlight.current.has(device.id)
                        ? (current.find((item) => item.id === device.id) ?? device)
                        : device,
                ),
            );
        }
        if (discoveredRes.data) setDiscovered(discoveredRes.data as unknown as DiscoveredDevice[]);
        if (sensorsRes.data) setSensors(sensorsRes.data as unknown as Sensor[]);
        if (useLoading) setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchAll(true);
        const interval = setInterval(() => fetchAll(false), POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [fetchAll]);

    const applyState = useCallback((lampId: string, state: Partial<DeviceState>) => {
        setLamps((current) =>
            current.map((device) =>
                device.id === lampId ? { ...device, state: { ...device.state, ...state } } : device,
            ),
        );
    }, []);

    const sendCommand = useCallback(
        async (device: Device, command: DeviceCommand) => {
            const previous = device.state;
            // Optimistic: the LAN round trip is milliseconds, so the UI should not wait.
            applyState(device.id, command as Partial<DeviceState>);
            setBusyDeviceIds((current) => [...current, device.id]);
            inFlight.current.add(device.id);

            const client = getTuyaEdenClient();
            const { data, error } = await client.tuya
                .devices({ id: device.id })
                .command.post(command);

            setBusyDeviceIds((current) => current.filter((id) => id !== device.id));
            inFlight.current.delete(device.id);

            if (error || !data) {
                applyState(device.id, previous);
                showToast(`Falha ao comandar "${device.name}"`, "error");
                return;
            }
            applyState(device.id, data as unknown as DeviceState);
        },
        [applyState, showToast],
    );

    const syncCatalogue = useCallback(async () => {
        setIsSyncingSensors(true);
        const { error } = await getTuyaEdenClient().tuya.catalogue.sync.post();
        setIsSyncingSensors(false);
        if (error) {
            showToast("Falha ao sincronizar o catálogo", "error");
            return;
        }
        showToast("Catálogo sincronizado", "success");
        fetchAll(false);
    }, [fetchAll, showToast]);

    const registerDiscovered = useCallback((device: DiscoveredDevice) => {
        setDraft({
            name: "",
            tuyaDeviceId: device.deviceId,
            localKey: "",
            ip: device.ip,
        });
        setShowNewLampForm(true);
    }, []);

    const openDevice = devices.find((device) => device.id === openDeviceId) ?? null;
    const visibleDevices = devices.filter((device) => !device.hidden);
    const hiddenDevices = devices.filter((device) => device.hidden);
    const shownDevices = showHiddenDevices ? devices : visibleDevices;
    const visibleLamps = visibleDevices.filter((device) => device.kind === "lamp");
    const visibleSwitches = visibleDevices.filter((device) => device.kind === "switch");
    const shownLamps = shownDevices.filter((device) => device.kind === "lamp");
    const shownSwitches = shownDevices.filter((device) => device.kind === "switch");
    const openSensor = sensors.find((sensor) => sensor.id === openSensorId) ?? null;
    const visibleSensors = sensors.filter((sensor) => !sensor.hidden);
    const hiddenSensors = sensors.filter((sensor) => sensor.hidden);
    const shownSensors = showHidden ? sensors : visibleSensors;

    return (
        <div className="p-3 flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <h1 className="text-xl">Casa</h1>
                <Button
                    variant="secondary"
                    onClick={() => {
                        setDraft(EMPTY_DRAFT);
                        setShowNewLampForm(true);
                    }}
                >
                    <PlusIcon className="size-4" /> Nova lâmpada
                </Button>
            </div>

            <NewLampForm
                isOpen={showNewLampForm}
                draft={draft}
                onDraftChange={setDraft}
                onCreated={() => fetchAll(false)}
                onClose={() => setShowNewLampForm(false)}
            />

            {isLoading ? (
                <p className="text-sm text-mist-400">Carregando...</p>
            ) : (
                <>
                    <section className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-semibold text-mist-300">
                                Iluminação ({visibleLamps.length})
                            </h2>
                            {hiddenDevices.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setShowHiddenDevices((current) => !current)}
                                    className="text-xs text-mist-400 hover:text-mist-300 cursor-pointer underline underline-offset-2"
                                >
                                    {showHiddenDevices
                                        ? "Esconder ocultas"
                                        : `Mostrar ocultas (${hiddenDevices.length})`}
                                </button>
                            )}
                        </div>
                        {shownLamps.length === 0 ? (
                            <p className="text-sm text-mist-400">
                                {hiddenDevices.length > 0
                                    ? "Todas as lâmpadas estão ocultas."
                                    : "Nenhuma lâmpada ainda. Clique em Sincronizar para importar as da sua conta Tuya."}
                            </p>
                        ) : (
                            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                                {shownLamps.map((device) => (
                                    <DeviceCard
                                        key={device.id}
                                        device={device}
                                        isBusy={busyDeviceIds.includes(device.id)}
                                        onCommand={(command) => sendCommand(device, command)}
                                        onOpen={() => setOpenDeviceId(device.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="flex flex-col gap-2">
                        <h2 className="text-sm font-semibold text-mist-300">
                            Interruptores ({visibleSwitches.length})
                        </h2>
                        {shownSwitches.length === 0 ? (
                            <p className="text-sm text-mist-400">
                                Nenhum interruptor. Clique em Sincronizar para importar os da sua
                                conta Tuya.
                            </p>
                        ) : (
                            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                                {shownSwitches.map((device) => (
                                    <DeviceCard
                                        key={device.id}
                                        device={device}
                                        isBusy={busyDeviceIds.includes(device.id)}
                                        onCommand={(command) => sendCommand(device, command)}
                                        onOpen={() => setOpenDeviceId(device.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-semibold text-mist-300">
                                Sensores ({visibleSensors.length})
                            </h2>
                            <div className="flex items-center gap-2">
                                {hiddenSensors.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowHidden((current) => !current)}
                                        className="text-xs text-mist-400 hover:text-mist-300 cursor-pointer underline underline-offset-2"
                                    >
                                        {showHidden
                                            ? "Esconder ocultos"
                                            : `Mostrar ocultos (${hiddenSensors.length})`}
                                    </button>
                                )}
                                <Button
                                    variant="secondary"
                                    onClick={syncCatalogue}
                                    isLoading={isSyncingSensors}
                                >
                                    <ArrowPathIcon className="size-4" /> Sincronizar
                                </Button>
                            </div>
                        </div>
                        {shownSensors.length === 0 ? (
                            <p className="text-sm text-mist-400">
                                {hiddenSensors.length > 0
                                    ? "Todos os sensores estão ocultos."
                                    : "Nenhum sensor ainda. Clique em Sincronizar para importar os da sua conta Tuya."}
                            </p>
                        ) : (
                            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                                {shownSensors.map((sensor) => (
                                    <SensorCard
                                        key={sensor.id}
                                        sensor={sensor}
                                        onOpen={() => setOpenSensorId(sensor.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>

                    <DiscoveredLamps devices={discovered} onRegister={registerDiscovered} />
                </>
            )}

            <Drawer
                isOpen={!!openDevice}
                onClose={() => setOpenDeviceId(null)}
                title={openDevice?.name}
            >
                {openDevice && (
                    <DeviceDrawerContent
                        device={openDevice}
                        isBusy={busyDeviceIds.includes(openDevice.id)}
                        onCommand={(command) => sendCommand(openDevice, command)}
                        onChanged={() => fetchAll(false)}
                        onDeleted={() => {
                            setOpenDeviceId(null);
                            fetchAll(false);
                        }}
                    />
                )}
            </Drawer>
            <Drawer
                isOpen={!!openSensor}
                onClose={() => setOpenSensorId(null)}
                title={openSensor?.name}
            >
                {openSensor && (
                    <SensorDrawerContent sensor={openSensor} onChanged={() => fetchAll(false)} />
                )}
            </Drawer>
        </div>
    );
}

export const tuyaDashboard: DashboardData = {
    id: "tuya",
    content: Dashboard,
    icon: HomeIcon,
    name: "Casa",
};
