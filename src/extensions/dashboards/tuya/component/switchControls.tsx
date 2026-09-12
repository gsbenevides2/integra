import { Switch } from "core/ui/components/switch";
import type { Device, DeviceCommand } from "../types";

interface Props {
    device: Device;
    isBusy: boolean;
    onCommand: (command: DeviceCommand) => void;
}

export function SwitchControls({ device, isBusy, onCommand }: Props) {
    const { state } = device;
    const channels = state.channels ?? {};
    const channelKeys = Object.keys(channels).sort((a, b) => Number(a) - Number(b));
    const disabled = isBusy || !state.online;

    if (!state.online) {
        return (
            <p className="text-sm text-mist-400">
                O interruptor está offline. Os controles voltam assim que ele responder.
            </p>
        );
    }

    if (channelKeys.length === 0) {
        return <p className="text-sm text-mist-400">Sem canais conhecidos ainda.</p>;
    }

    return (
        <div className="flex flex-col gap-2">
            {channelKeys.map((channel) => (
                <Switch
                    key={channel}
                    checked={channels[channel] === true}
                    disabled={disabled}
                    onChange={(checked) => onCommand({ channels: { [channel]: checked } })}
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
    );
}
