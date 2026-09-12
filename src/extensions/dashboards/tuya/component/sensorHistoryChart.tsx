import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import type { SensorReading } from "../types";

interface Props {
    readings: SensorReading[];
    code: string;
    label: string;
    /** Divides the raw value, for data points reported in tenths. */
    scale?: number;
    unit?: string;
    /** Renders as a step chart with a Yes/No axis. */
    boolean?: boolean;
    color?: string;
}

function formatTime(value: string) {
    return new Date(value).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function SensorHistoryChart({
    readings,
    code,
    label,
    scale = 1,
    unit = "",
    boolean: isBoolean = false,
    color = "#38bdf8",
}: Props) {
    const data = readings
        .filter((reading) => reading.code === code)
        .map((reading) => ({
            recordedAt: reading.recordedAt,
            value: isBoolean ? (reading.value === "true" ? 1 : 0) : Number(reading.value) / scale,
        }))
        .filter((point) => Number.isFinite(point.value));

    if (data.length === 0) return null;

    return (
        <div className="bg-gray-800 rounded-md p-3 flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{label}</h3>
            <div className="w-full h-52">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.4} />
                        <XAxis
                            dataKey="recordedAt"
                            tickFormatter={formatTime}
                            tick={{ fontSize: 11 }}
                            stroke="#9ca3af"
                            minTickGap={40}
                        />
                        <YAxis
                            tick={{ fontSize: 11 }}
                            stroke="#9ca3af"
                            unit={isBoolean ? "" : unit}
                            domain={isBoolean ? [0, 1] : ["auto", "auto"]}
                            ticks={isBoolean ? [0, 1] : undefined}
                            tickFormatter={isBoolean ? (v) => (v === 1 ? "Sim" : "Não") : undefined}
                            width={isBoolean ? 44 : 48}
                        />
                        <Tooltip
                            labelFormatter={(value) => formatTime(String(value))}
                            formatter={(value) => [
                                isBoolean
                                    ? Number(value) === 1
                                        ? "Sim"
                                        : "Não"
                                    : `${Number(value).toFixed(1)}${unit}`,
                                label,
                            ]}
                            contentStyle={{
                                backgroundColor: "#111827",
                                border: "1px solid #374151",
                                fontSize: 12,
                            }}
                        />
                        <Line
                            type={isBoolean ? "stepAfter" : "monotone"}
                            dataKey="value"
                            name={label}
                            stroke={color}
                            dot={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
