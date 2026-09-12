import { useEffect, useRef, useState } from "react";

interface Props {
    value: number;
    /** Called when the drag ends, not while the thumb moves. */
    onCommit: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    label?: string;
    formatValue?: (value: number) => string;
    /** CSS background for the track; defaults to a bar filled up to the current value. */
    track?: string;
}

const THUMB =
    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4 " +
    "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-mist-200 " +
    "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-gray-900 " +
    "[&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:size-4 " +
    "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-mist-200 " +
    "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-gray-900 " +
    "[&::-moz-range-track]:bg-transparent";

export function Slider({
    value,
    onCommit,
    min = 0,
    max = 100,
    step = 1,
    disabled,
    label,
    formatValue = (v) => `${v}%`,
    track,
}: Props) {
    const [local, setLocal] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);
    const isDragging = useRef(false);
    const commitRef = useRef(onCommit);
    commitRef.current = onCommit;

    // While the thumb is held the incoming value is ignored: a poll landing
    // mid-drag would otherwise yank the thumb back to the device reading.
    useEffect(() => {
        if (!isDragging.current) setLocal(value);
    }, [value]);

    // The native change event fires when the drag ends (and on each arrow key),
    // which is exactly when the command should leave.
    useEffect(() => {
        const input = inputRef.current;
        if (!input) return;
        const commit = () => {
            isDragging.current = false;
            commitRef.current(Number(input.value));
        };
        input.addEventListener("change", commit);
        return () => input.removeEventListener("change", commit);
    }, []);

    const percent = max > min ? ((local - min) / (max - min)) * 100 : 0;
    const background =
        track ??
        `linear-gradient(to right, var(--color-mist-400) ${percent}%, var(--color-gray-700) ${percent}%)`;

    return (
        <label className="flex flex-col gap-1">
            {label && (
                <span className="text-xs text-mist-400">
                    {label} · {formatValue(local)}
                </span>
            )}
            <div
                className={`relative flex h-4 w-full items-center ${disabled ? "opacity-50" : ""}`}
            >
                <div
                    className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                    style={{ background }}
                />
                <input
                    ref={inputRef}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={local}
                    disabled={disabled}
                    onPointerDown={() => {
                        isDragging.current = true;
                    }}
                    onChange={(e) => setLocal(Number(e.target.value))}
                    className={`relative h-4 w-full appearance-none bg-transparent outline-0 cursor-pointer disabled:cursor-not-allowed ${THUMB}`}
                />
            </div>
        </label>
    );
}
