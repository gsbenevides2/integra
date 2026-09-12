import { BoltIcon, CloudIcon, LightBulbIcon } from "@heroicons/react/24/outline";
import { Slider } from "core/ui/components/slider";
import { Switch } from "core/ui/components/switch";
import type { Device, DeviceCommand } from "../types";

interface Props {
    device: Device;
    isBusy: boolean;
    onCommand: (command: DeviceCommand) => void;
    onOpen: () => void;
}

export function DeviceCard({ device, isBusy, onCommand, onOpen }: Props) {
    const { state } = device;
    const isOn = state.power === true;
    const channels = state.channels ?? {};
    const channelKeys = Object.keys(channels).sort((a, b) => Number(a) - Number(b));
    const anyChannelOn = channelKeys.some((key) => channels[key]);
    const isSwitch = device.kind === "switch";

    return (
        <div
            className={`bg-gray-800 rounded-md p-3 flex flex-col gap-3 ${
                device.hidden ? "opacity-50" : ""
            }`}
        >
            <div className="flex items-start justify-between gap-2">
                <button
                    type="button"
                    onClick={onOpen}
                    className="flex items-center gap-2 text-left cursor-pointer min-w-0"
                >
                    {device.kind === "switch" ? (
                        <BoltIcon
                            className={`size-5 shrink-0 ${
                                anyChannelOn ? "text-amber-300" : "text-mist-500"
                            }`}
                        />
                    ) : (
                        <LightBulbIcon
                            className={`size-5 shrink-0 ${
                                isOn ? "text-amber-300" : "text-mist-500"
                            }`}
                        />
                    )}
                    <span className="truncate">{device.name}</span>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                    {device.hidden && (
                        <span className="text-xs rounded-full px-2 py-0.5 bg-gray-700 text-mist-300">
                            Oculta
                        </span>
                    )}
                    {state.transport === "cloud" && state.online && (
                        <span
                            title="A rede local não respondeu; controlada pela nuvem da Tuya"
                            className="text-xs rounded-full px-2 py-0.5 bg-sky-950 text-sky-300 flex items-center gap-1"
                        >
                            <CloudIcon className="size-3.5" /> Nuvem
                        </span>
                    )}
                    <span
                        className={`text-xs rounded-full px-2 py-0.5 ${
                            state.online ? "bg-green-900 text-green-300" : "bg-red-950 text-red-300"
                        }`}
                    >
                        {state.online ? "Online" : "Offline"}
                    </span>
                </div>
            </div>

            {isSwitch ? (
                channelKeys.length === 0 ? (
                    <p className="text-xs text-mist-400">Sem canais conhecidos ainda.</p>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        {channelKeys.map((channel) => (
                            <Switch
                                key={channel}
                                checked={channels[channel] === true}
                                disabled={isBusy || !state.online}
                                onChange={(checked) =>
                                    onCommand({ channels: { [channel]: checked } })
                                }
                                label={
                                    channelKeys.length === 1
                                        ? channels[channel]
                                            ? "Ligado"
                                            : "Desligado"
                                        : `Canal ${channel}`
                                }
                            />
                        ))}
                    </div>
                )
            ) : (
                <Switch
                    checked={isOn}
                    disabled={isBusy || !state.online}
                    onChange={(checked) => onCommand({ power: checked })}
                    label={isOn ? "Ligada" : "Desligada"}
                />
            )}

            {!isSwitch && state.brightness !== null && (
                <Slider
                    label="Brilho"
                    min={1}
                    max={100}
                    value={state.brightness}
                    disabled={isBusy || !state.online}
                    onCommit={(brightness) => onCommand({ brightness })}
                />
            )}

            {!isSwitch && state.colorHex && (
                <div className="flex items-center gap-2">
                    <span
                        className="size-4 rounded-full border border-gray-600 shrink-0"
                        style={{
                            backgroundColor: state.workMode === "colour" ? state.colorHex : "#fff",
                        }}
                    />
                    <span className="text-xs text-mist-400">
                        {state.workMode === "colour" ? state.colorHex : "Modo branco"}
                    </span>
                </div>
            )}
        </div>
    );
}
