import { useCallback, useEffect, useRef, useState } from "react";
import { PowerIcon } from "@heroicons/react/24/outline";
import { RingPicker } from "core/ui/components/ringPicker";
import { Slider } from "core/ui/components/slider";
import type { Hsv } from "utils/tuya/color";
import {
    COLOR_PRESETS,
    HUE_STOPS,
    WHITE_STOPS,
    currentHex,
    hexFromHsv,
    hsvFromHex,
    hueHex,
    isColourMode,
    sameColor,
    whiteHex,
} from "../lampColor";
import type { Device, DeviceCommand } from "../types";

/** The white arc is open at the bottom, warm on the left and cool on the right. */
const WHITE_START = 210;
const WHITE_SWEEP = 300;

type Tab = "white" | "colour";

interface Props {
    device: Device;
    isBusy: boolean;
    onCommand: (command: DeviceCommand) => void;
}

export function LampControls({ device, isBusy, onCommand }: Props) {
    const { state } = device;
    const disabled = isBusy || !state.online;

    const hasColor = state.colorHex !== null;
    const hasTemp = state.colorTemp !== null;
    const hasTabs = hasColor && hasTemp;

    const [tab, setTab] = useState<Tab>(isColourMode(state) ? "colour" : "white");
    const modeRef = useRef(state.workMode);
    modeRef.current = state.workMode;
    // The drawer stays mounted across devices, so the tab follows whichever one is open.
    const deviceId = device.id;
    useEffect(() => {
        setTab(modeRef.current === "colour" ? "colour" : "white");
    }, [deviceId]);

    // Hue, saturation and value survive the round trip through `#rrggbb` only approximately,
    // so the panel keeps its own copy and only re-reads it when the lamp changed elsewhere.
    const [hsv, setHsv] = useState(() => hsvFromHex(state.colorHex));
    const sent = useRef(hsv);

    useEffect(() => {
        if (!state.colorHex) return;
        const reported = hsvFromHex(state.colorHex);
        if (sameColor(reported, sent.current)) return;
        sent.current = reported;
        setHsv(reported);
    }, [state.colorHex]);

    const commitColor = useCallback(
        (next: Hsv) => {
            setHsv(next);
            sent.current = next;
            onCommand({ colorHex: hexFromHsv(next) });
        },
        [onCommand],
    );

    const isOn = state.power === true;
    const showColour = tab === "colour" && hasColor;
    const swatch = showColour ? hueHex(hsv) : whiteHex(state.colorTemp);
    const brightness = showColour ? Math.max(1, Math.round(hsv.v * 100)) : state.brightness;

    const selectTab = useCallback(
        (next: Tab) => {
            setTab(next);
            if (next === tab || !state.workMode) return;
            // The tabs are the mode switch, matching what the lamp's own app does.
            if (next === "colour") onCommand({ colorHex: hexFromHsv(hsv) });
            else onCommand({ workMode: "white" });
        },
        [hsv, onCommand, state.workMode, tab],
    );

    if (!state.online) {
        return (
            <p className="text-sm text-mist-400">
                A lâmpada está offline. Os controles voltam assim que ela responder.
            </p>
        );
    }

    return (
        <div className="flex flex-col items-center gap-4">
            {hasTabs && (
                <div className="flex gap-1 rounded-full bg-gray-800 p-1 text-xs">
                    <TabButton active={tab === "white"} onClick={() => selectTab("white")}>
                        Branco
                    </TabButton>
                    <TabButton active={tab === "colour"} onClick={() => selectTab("colour")}>
                        Cor
                    </TabButton>
                </div>
            )}

            {showColour ? (
                <RingPicker
                    label="Matiz"
                    colors={HUE_STOPS}
                    value={hsv.h / 360}
                    knobColor={hueHex(hsv)}
                    disabled={disabled}
                    onCommit={(value) => commitColor({ ...hsv, h: value * 360 })}
                >
                    <PowerButton
                        color={swatch}
                        isOn={isOn}
                        disabled={disabled}
                        onClick={() => onCommand({ power: !isOn })}
                    />
                </RingPicker>
            ) : hasTemp ? (
                <RingPicker
                    label="Temperatura de cor"
                    colors={WHITE_STOPS}
                    startAngle={WHITE_START}
                    sweep={WHITE_SWEEP}
                    value={(state.colorTemp ?? 50) / 100}
                    knobColor={whiteHex(state.colorTemp)}
                    disabled={disabled}
                    onCommit={(value) => onCommand({ colorTemp: Math.round(value * 100) })}
                >
                    <PowerButton
                        color={swatch}
                        isOn={isOn}
                        disabled={disabled}
                        onClick={() => onCommand({ power: !isOn })}
                    />
                </RingPicker>
            ) : (
                <PowerButton
                    color={currentHex(state)}
                    isOn={isOn}
                    disabled={disabled}
                    onClick={() => onCommand({ power: !isOn })}
                />
            )}

            <p className="text-sm text-mist-300">
                {isOn ? "Ligada" : "Desligada"}
                {brightness !== null && ` · ${brightness}%`}
            </p>

            <div className="flex w-full flex-col gap-3">
                {brightness !== null && (
                    <Slider
                        label="Brilho"
                        min={1}
                        max={100}
                        value={brightness}
                        disabled={disabled}
                        track={`linear-gradient(to right, #000, ${showColour ? hueHex(hsv) : whiteHex(state.colorTemp)})`}
                        onCommit={(value) =>
                            showColour
                                ? commitColor({ ...hsv, v: value / 100 })
                                : onCommand({ brightness: value })
                        }
                    />
                )}

                {showColour && (
                    <Slider
                        label="Saturação"
                        min={0}
                        max={100}
                        value={Math.round(hsv.s * 100)}
                        disabled={disabled}
                        track={`linear-gradient(to right, #ffffff, ${hueHex({ ...hsv, s: 1 })})`}
                        onCommit={(value) => commitColor({ ...hsv, s: value / 100 })}
                    />
                )}
            </div>

            {showColour ? (
                <div className="flex w-full flex-wrap gap-2">
                    {COLOR_PRESETS.map((preset) => (
                        <Preset
                            key={preset}
                            color={preset}
                            disabled={disabled}
                            selected={hueHex(hsv).toLowerCase() === preset}
                            onClick={() => commitColor({ ...hsvFromHex(preset), v: hsv.v })}
                        />
                    ))}
                </div>
            ) : (
                hasTemp && (
                    <div className="flex w-full flex-wrap gap-2">
                        {[
                            { label: "Quente", value: 0 },
                            { label: "Neutro", value: 50 },
                            { label: "Frio", value: 100 },
                        ].map((preset) => (
                            <button
                                key={preset.label}
                                type="button"
                                disabled={disabled}
                                onClick={() => onCommand({ colorTemp: preset.value })}
                                className="flex items-center gap-1.5 rounded-full bg-gray-800 px-3 py-1 text-xs text-mist-300 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 hover:bg-gray-700"
                            >
                                <span
                                    className="size-3 rounded-full"
                                    style={{ background: whiteHex(preset.value) }}
                                />
                                {preset.label}
                            </button>
                        ))}
                    </div>
                )
            )}
        </div>
    );
}

function TabButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-full px-4 py-1 cursor-pointer transition-colors ${
                active ? "bg-gray-700 text-mist-200" : "text-mist-400 hover:text-mist-300"
            }`}
        >
            {children}
        </button>
    );
}

function PowerButton({
    color,
    isOn,
    disabled,
    onClick,
}: {
    color: string;
    isOn: boolean;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            aria-label={isOn ? "Desligar" : "Ligar"}
            disabled={disabled}
            onClick={onClick}
            className="flex size-full items-center justify-center rounded-full border border-gray-700 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            style={{
                background: isOn ? color : "var(--color-gray-800)",
                boxShadow: isOn ? `0 0 3rem -0.5rem ${color}` : undefined,
            }}
        >
            <PowerIcon className={`size-8 ${isOn ? "text-gray-900" : "text-mist-500"}`} />
        </button>
    );
}

function Preset({
    color,
    selected,
    disabled,
    onClick,
}: {
    color: string;
    selected: boolean;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            aria-label={`Cor ${color}`}
            disabled={disabled}
            onClick={onClick}
            style={{ background: color }}
            className={`size-7 rounded-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                selected ? "ring-2 ring-white ring-offset-2 ring-offset-gray-900" : ""
            }`}
        />
    );
}
