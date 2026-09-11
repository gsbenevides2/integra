import type { RunDocument } from "extensions/scripts/execution-logs/types";
import { useCallback, useMemo, useState } from "react";
import {
    CartesianGrid,
    Legend,
    ReferenceArea,
    ResponsiveContainer,
    Scatter,
    ScatterChart,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

interface Props {
    runs: RunDocument[];
    onSelectRun: (traceId: string) => void;
}

interface ChartPoint {
    traceId: string;
    triggerId: string;
    startTime: number;
    durationMs: number;
    status: "SUCCESS" | "ERROR" | "running";
}

const STATUS_COLORS: Record<string, string> = {
    SUCCESS: "#22c55e",
    ERROR: "#ef4444",
    running: "#6b7280",
};

const STATUS_LABELS: Record<string, string> = {
    SUCCESS: "Success",
    ERROR: "Error",
    running: "Running",
};

function formatDate(ts: number) {
    return new Date(ts).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatDuration(ms: number) {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

function CustomTooltip({
    active,
    payload,
}: {
    active?: boolean;
    payload?: { payload: ChartPoint }[];
}) {
    if (!active || !payload?.length) return null;
    const p = payload[0]?.payload;
    if (!p) return null;
    return (
        <div className="bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-xs leading-relaxed">
            <p>
                <strong>traceId:</strong> {p.traceId.slice(0, 16)}...
            </p>
            <p>
                <strong>triggerId:</strong> {p.triggerId}
            </p>
            <p>
                <strong>start:</strong> {formatDate(p.startTime)}
            </p>
            <p>
                <strong>duration:</strong> {formatDuration(p.durationMs)}
            </p>
            <p>
                <strong>status:</strong>{" "}
                <span className="font-semibold" style={{ color: STATUS_COLORS[p.status] }}>
                    {p.status}
                </span>
            </p>
        </div>
    );
}

export function DotChart({ runs, onSelectRun }: Props) {
    const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
    const [refAreaRight, setRefAreaRight] = useState<number | null>(null);
    const [zoomDomain, setZoomDomain] = useState<{ start: number; end: number } | null>(null);

    const data = useMemo<ChartPoint[]>(
        () =>
            runs.map((run) => ({
                traceId: run.traceId,
                triggerId: run.triggerId,
                startTime: new Date(run.startTime).getTime(),
                durationMs: run.durationMs ?? 1,
                status: run.status ?? "running",
            })),
        [runs],
    );

    const filteredData = useMemo(() => {
        if (!zoomDomain) return data;
        return data.filter((p) => p.startTime >= zoomDomain.start && p.startTime <= zoomDomain.end);
    }, [data, zoomDomain]);

    const handleMouseDown = useCallback((e: { activeLabel?: string | number }) => {
        const label = e.activeLabel;
        if (label != null) {
            const num = typeof label === "number" ? label : Number(label);
            if (!Number.isNaN(num)) setRefAreaLeft(num);
        }
    }, []);

    const handleMouseMove = useCallback(
        (e: { activeLabel?: string | number }) => {
            if (refAreaLeft == null) return;
            const label = e.activeLabel;
            if (label != null) {
                const num = typeof label === "number" ? label : Number(label);
                if (!Number.isNaN(num)) setRefAreaRight(num);
            }
        },
        [refAreaLeft],
    );

    const handleMouseUp = useCallback(() => {
        if (refAreaLeft == null || refAreaRight == null) {
            setRefAreaLeft(null);
            setRefAreaRight(null);
            return;
        }
        const left = Math.min(refAreaLeft, refAreaRight);
        const right = Math.max(refAreaLeft, refAreaRight);
        if (right - left < 1000) {
            setRefAreaLeft(null);
            setRefAreaRight(null);
            return;
        }
        setZoomDomain({ start: left, end: right });
        setRefAreaLeft(null);
        setRefAreaRight(null);
    }, [refAreaLeft, refAreaRight]);

    const resetZoom = useCallback(() => setZoomDomain(null), []);

    const xDomain = useMemo(() => {
        if (zoomDomain) return [zoomDomain.start, zoomDomain.end];
        return ["dataMin", "dataMax"];
    }, [zoomDomain]);

    return (
        <div className="bg-gray-800 rounded-md p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Duration vs. Start</h3>
                {zoomDomain && (
                    <button
                        type="button"
                        className="text-xs px-2 py-0.5 rounded-md hover:bg-gray-700 cursor-pointer"
                        onClick={resetZoom}
                    >
                        Resetar zoom
                    </button>
                )}
            </div>
            <div className="w-full h-70 sm:h-90">
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.4} />
                        <XAxis
                            dataKey="startTime"
                            scale="time"
                            type="number"
                            domain={xDomain}
                            tickFormatter={(ts: number) => formatDate(ts)}
                            tick={{ fontSize: 11 }}
                            stroke="#9ca3af"
                            angle={-35}
                            textAnchor="end"
                            height={56}
                            minTickGap={40}
                            tickMargin={8}
                        />
                        <YAxis
                            dataKey="durationMs"
                            scale="log"
                            type="number"
                            domain={[1, "auto"]}
                            tickFormatter={(v: number) => formatDuration(v)}
                            tick={{ fontSize: 11 }}
                            stroke="#9ca3af"
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                            formatter={(value: string) => STATUS_LABELS[value] ?? value}
                            wrapperStyle={{ fontSize: 12 }}
                        />
                        {(["SUCCESS", "ERROR", "running"] as const).map((status) => (
                            <Scatter
                                key={status}
                                name={status}
                                data={filteredData.filter((p) => p.status === status)}
                                fill={STATUS_COLORS[status]}
                                shape="circle"
                                cursor="pointer"
                                onClick={(point: { payload?: ChartPoint }) => {
                                    const traceId = point.payload?.traceId;
                                    if (traceId) onSelectRun(traceId);
                                }}
                            />
                        ))}
                        {refAreaLeft != null && refAreaRight != null && (
                            <ReferenceArea
                                x1={Math.min(refAreaLeft, refAreaRight)}
                                x2={Math.max(refAreaLeft, refAreaRight)}
                                strokeOpacity={0.3}
                                fill="#8884d8"
                                fillOpacity={0.3}
                            />
                        )}
                    </ScatterChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
