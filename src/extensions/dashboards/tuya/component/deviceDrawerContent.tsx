import { useCallback, useEffect, useState } from "react";
import { SignalIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "core/ui/components/button";
import { useConfirm } from "core/ui/components/confirm/context";
import { Input } from "core/ui/components/input";
import { Slider } from "core/ui/components/slider";
import { Switch } from "core/ui/components/switch";
import { useToast } from "core/ui/components/toast";
import { getTuyaEdenClient } from "extensions/scripts/tuya/client";
import type { HistoryPoint, Device, DeviceCommand } from "../types";
import { DeviceHistoryChart } from "./deviceHistoryChart";

// 0% is the warmest reading the lamp reports and 100% the coolest, so the track
// runs from orange to blue.
const COLOR_TEMP_TRACK = "linear-gradient(to right, #ffb46b, #f6f1ea 50%, #8ec2ff)";

interface Props {
    device: Device;
    isBusy: boolean;
    onCommand: (command: DeviceCommand) => void;
    onChanged: () => void;
    onDeleted: () => void;
}

export function DeviceDrawerContent({ device, isBusy, onCommand, onChanged, onDeleted }: Props) {
    const { showToast } = useToast();
    const confirm = useConfirm();

    const [name, setName] = useState(device.name);
    const [ip, setIp] = useState(device.ip ?? "");
    const [localKey, setLocalKey] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isProbing, setIsProbing] = useState(false);
    const [history, setHistory] = useState<HistoryPoint[]>([]);

    useEffect(() => {
        setName(device.name);
        setIp(device.ip ?? "");
        setLocalKey("");
    }, [device.id, device.name, device.ip]);

    useEffect(() => {
        let cancelled = false;
        const client = getTuyaEdenClient();
        client.tuya
            .devices({ id: device.id })
            .history.get({ query: {} })
            .then(({ data }) => {
                if (cancelled || !data) return;
                setHistory((data as unknown as { snapshots: HistoryPoint[] }).snapshots ?? []);
            });
        return () => {
            cancelled = true;
        };
    }, [device.id]);

    const save = useCallback(async () => {
        setIsSaving(true);
        const client = getTuyaEdenClient();
        const { error } = await client.tuya.devices({ id: device.id }).put({
            name,
            ip: ip || null,
            // An empty field means "keep the stored key", so it is simply not sent.
            ...(localKey ? { localKey } : {}),
        });
        setIsSaving(false);
        if (error) {
            showToast("Falha ao salvar a lâmpada", "error");
            return;
        }
        setLocalKey("");
        showToast("Lâmpada salva", "success");
        onChanged();
    }, [device.id, name, ip, localKey, showToast, onChanged]);

    const probe = useCallback(async () => {
        setIsProbing(true);
        const client = getTuyaEdenClient();
        const { data, error } = await client.tuya.devices({ id: device.id }).probe.post();
        setIsProbing(false);
        if (error || !data) {
            showToast("Não foi possível conectar na lâmpada", "error");
            return;
        }
        const result = data as unknown as { protocolVersion: string; bulbType: string };
        showToast(
            `Conectada: protocolo ${result.protocolVersion}, tipo ${result.bulbType}`,
            "success",
        );
        onChanged();
    }, [device.id, showToast, onChanged]);

    const remove = useCallback(async () => {
        const ok = await confirm({
            title: "Remover lâmpada",
            message: `Remover "${device.name}"? O histórico dela também será apagado.`,
        });
        if (!ok) return;
        const client = getTuyaEdenClient();
        const { error } = await client.tuya.devices({ id: device.id }).delete();
        if (error) {
            showToast("Falha ao remover a lâmpada", "error");
            return;
        }
        showToast("Lâmpada removida", "success");
        onDeleted();
    }, [confirm, device.id, device.name, showToast, onDeleted]);

    const { state } = device;
    const controlsDisabled = isBusy || !state.online;

    return (
        <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-mist-300">Controle</h3>

                <Switch
                    checked={state.power === true}
                    disabled={controlsDisabled}
                    onChange={(checked) => onCommand({ power: checked })}
                    label={state.power ? "Ligada" : "Desligada"}
                />

                {state.brightness !== null && (
                    <Slider
                        label="Brilho"
                        min={1}
                        max={100}
                        value={state.brightness}
                        disabled={controlsDisabled}
                        onCommit={(brightness) => onCommand({ brightness })}
                    />
                )}

                {state.colorTemp !== null && (
                    <Slider
                        label="Temperatura de cor"
                        min={0}
                        max={100}
                        value={state.colorTemp}
                        disabled={controlsDisabled}
                        onCommit={(colorTemp) => onCommand({ colorTemp })}
                        track={COLOR_TEMP_TRACK}
                    />
                )}

                {state.colorHex !== null && (
                    <label className="flex items-center gap-2">
                        <span className="text-xs text-mist-400">Cor</span>
                        <input
                            type="color"
                            value={state.colorHex}
                            disabled={controlsDisabled}
                            onChange={(e) => onCommand({ colorHex: e.target.value })}
                            className="h-7 w-12 bg-transparent cursor-pointer disabled:cursor-not-allowed"
                        />
                        <span className="text-xs text-mist-400">{state.colorHex}</span>
                    </label>
                )}
            </section>

            <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-mist-300">Configuração</h3>
                <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
                <Input
                    label="IP (vazio = descoberta automática)"
                    value={ip}
                    onChange={(e) => setIp(e.target.value)}
                />
                <Input
                    label="localKey (vazio = manter a atual)"
                    type="password"
                    value={localKey}
                    onChange={(e) => setLocalKey(e.target.value)}
                />
                <Switch
                    checked={device.hidden}
                    onChange={async (hidden) => {
                        const { error } = await getTuyaEdenClient()
                            .tuya.devices({ id: device.id })
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
                    Ocultar tira a lâmpada do painel sem parar o controle nem o histórico.
                </p>
                <dl className="text-xs text-mist-400 flex flex-wrap gap-x-4 gap-y-1">
                    <div>
                        <dt className="inline">Device ID: </dt>
                        <dd className="inline font-mono">{device.tuyaDeviceId}</dd>
                    </div>
                    <div>
                        <dt className="inline">Protocolo: </dt>
                        <dd className="inline">{device.protocolVersion ?? "não detectado"}</dd>
                    </div>
                    <div>
                        <dt className="inline">Tipo: </dt>
                        <dd className="inline">{device.bulbType ?? "não detectado"}</dd>
                    </div>
                </dl>
                <div className="flex flex-wrap gap-2">
                    <Button onClick={save} isLoading={isSaving}>
                        Salvar
                    </Button>
                    <Button variant="secondary" onClick={probe} isLoading={isProbing}>
                        <SignalIcon className="size-4" /> Testar conexão
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
