import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

interface Props {
    /** 0-1, the position along the arc. */
    value: number;
    /** Called when the drag ends, not while the knob moves. */
    onCommit: (value: number) => void;
    /** Colours painted evenly along the arc. */
    colors: string[];
    /** Degrees clockwise from 12 o'clock where the arc begins. */
    startAngle?: number;
    /** How many degrees the arc covers. */
    sweep?: number;
    /** Colour of the knob; defaults to the arc colour under it. */
    knobColor?: string;
    disabled?: boolean;
    label: string;
    /** Rendered inside the ring. */
    children?: ReactNode;
}

/** Where the hole starts, as a fraction of the outer radius. */
const INNER = 0.64;
/** Distance of the knob from the centre, as a fraction of the box width. */
const ORBIT = ((INNER + 1) / 2) * 50;

export function RingPicker({
    value,
    onCommit,
    colors,
    startAngle = 0,
    sweep = 360,
    knobColor,
    disabled,
    label,
    children,
}: Props) {
    const boxRef = useRef<HTMLDivElement>(null);
    const [local, setLocal] = useState(value);
    const isDragging = useRef(false);

    // While the knob is held the incoming value is ignored: a poll landing mid-drag
    // would otherwise yank it back to the device reading.
    useEffect(() => {
        if (!isDragging.current) setLocal(value);
    }, [value]);

    const valueAt = useCallback(
        (clientX: number, clientY: number) => {
            const rect = boxRef.current?.getBoundingClientRect();
            if (!rect) return null;
            const dx = clientX - (rect.left + rect.width / 2);
            const dy = clientY - (rect.top + rect.height / 2);
            const radius = Math.hypot(dx, dy) / (rect.width / 2);

            let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
            if (angle < 0) angle += 360;
            let position = (angle - startAngle + 360) % 360;
            // Outside the arc, the nearer end is what the finger meant.
            if (position > sweep) position = position - sweep < 360 - position ? sweep : 0;

            return { value: position / sweep, radius };
        },
        [startAngle, sweep],
    );

    const onPointerDown = useCallback(
        (event: PointerEvent<HTMLDivElement>) => {
            if (disabled) return;
            const hit = valueAt(event.clientX, event.clientY);
            // The centre belongs to whatever is rendered inside the ring.
            if (!hit || hit.radius < INNER) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            isDragging.current = true;
            setLocal(hit.value);
        },
        [disabled, valueAt],
    );

    const onPointerMove = useCallback(
        (event: PointerEvent<HTMLDivElement>) => {
            if (!isDragging.current) return;
            const hit = valueAt(event.clientX, event.clientY);
            if (hit) setLocal(hit.value);
        },
        [valueAt],
    );

    const onPointerUp = useCallback(
        (event: PointerEvent<HTMLDivElement>) => {
            if (!isDragging.current) return;
            isDragging.current = false;
            event.currentTarget.releasePointerCapture(event.pointerId);
            const hit = valueAt(event.clientX, event.clientY);
            onCommit(hit ? hit.value : local);
        },
        [local, onCommit, valueAt],
    );

    const step = useCallback(
        (delta: number) => {
            const next = Math.min(1, Math.max(0, local + delta));
            setLocal(next);
            onCommit(next);
        },
        [local, onCommit],
    );

    const stops = colors
        .map((color, index) => `${color} ${(index / (colors.length - 1)) * sweep}deg`)
        .join(", ");
    const tail = sweep < 360 ? `, transparent ${sweep}deg, transparent 360deg` : "";
    const knobAngle = ((startAngle + local * sweep - 90) * Math.PI) / 180;

    return (
        <div
            ref={boxRef}
            role="slider"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(local * 100)}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : 0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={(event) => {
                if (disabled) return;
                if (event.key === "ArrowRight" || event.key === "ArrowUp") step(0.01);
                else if (event.key === "ArrowLeft" || event.key === "ArrowDown") step(-0.01);
                else return;
                event.preventDefault();
            }}
            className={`relative aspect-square w-full max-w-[17rem] touch-none select-none outline-0 ${
                disabled ? "opacity-40" : "cursor-pointer"
            }`}
        >
            <div
                className="absolute inset-0 rounded-full"
                style={{
                    background: `conic-gradient(from ${startAngle}deg at 50% 50%, ${stops}${tail})`,
                    WebkitMaskImage: `radial-gradient(closest-side, transparent ${INNER * 100}%, #000 ${INNER * 100 + 0.5}%)`,
                    maskImage: `radial-gradient(closest-side, transparent ${INNER * 100}%, #000 ${INNER * 100 + 0.5}%)`,
                }}
            />

            {/* A conic gradient ends square, so the open arc gets its caps drawn back on. */}
            {sweep < 360 && (
                <>
                    <Cap angle={startAngle} color={colors[0]!} />
                    <Cap angle={startAngle + sweep} color={colors[colors.length - 1]!} />
                </>
            )}

            <div
                className="absolute rounded-full border-[3px] border-white shadow-lg"
                style={{
                    width: `${(1 - INNER) * 50 + 4}%`,
                    height: `${(1 - INNER) * 50 + 4}%`,
                    left: `${50 + Math.cos(knobAngle) * ORBIT}%`,
                    top: `${50 + Math.sin(knobAngle) * ORBIT}%`,
                    transform: "translate(-50%, -50%)",
                    background: knobColor ?? "transparent",
                }}
            />

            {children && (
                <div
                    className="absolute flex items-center justify-center"
                    style={{
                        // A little past the hole, so the ring and the centre stay visually apart.
                        inset: `${(1 - INNER) * 50 + 4}%`,
                    }}
                >
                    {children}
                </div>
            )}
        </div>
    );
}

function Cap({ angle, color }: { angle: number; color: string }) {
    const radians = ((angle - 90) * Math.PI) / 180;
    return (
        <div
            className="pointer-events-none absolute rounded-full"
            style={{
                width: `${(1 - INNER) * 50}%`,
                height: `${(1 - INNER) * 50}%`,
                left: `${50 + Math.cos(radians) * ORBIT}%`,
                top: `${50 + Math.sin(radians) * ORBIT}%`,
                transform: "translate(-50%, -50%)",
                background: color,
            }}
        />
    );
}
