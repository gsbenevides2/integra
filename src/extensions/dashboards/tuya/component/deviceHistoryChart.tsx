import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import type { HistoryPoint } from "../types";

function formatTime(value: string) {
    return new Date(value).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function DeviceHistoryChart({ data }: { data: HistoryPoint[] }) {
    const chartData = data.map((point) => ({
        ...point,
        // Power and reachability are booleans; plotting them at full scale keeps them
        // readable alongside the 0-100 brightness line.
        powerLine: point.power ? 100 : 0,
        onlineLine: point.online ? 100 : 0,
    }));

    return (
        <div className="bg-gray-800 rounded-md p-3 flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Histórico</h3>
            <div className="w-full h-56">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
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
                            domain={[0, 100]}
                            unit="%"
                        />
                        <Tooltip
                            labelFormatter={(value) => formatTime(String(value))}
                            formatter={(value, name, item) => {
                                if (name === "Ligada") {
                                    return [item.payload.power ? "Sim" : "Não", name];
                                }
                                if (name === "Alcançável") {
                                    return [item.payload.online ? "Sim" : "Não", name];
                                }
                                return [`${Number(value).toFixed(0)}%`, name];
                            }}
                            contentStyle={{
                                backgroundColor: "#111827",
                                border: "1px solid #374151",
                                fontSize: 12,
                            }}
                        />
                        <Line
                            type="stepAfter"
                            dataKey="powerLine"
                            name="Ligada"
                            stroke="#fbbf24"
                            dot={false}
                        />
                        <Line
                            type="stepAfter"
                            dataKey="brightness"
                            name="Brilho"
                            stroke="#38bdf8"
                            dot={false}
                            connectNulls
                        />
                        <Line
                            type="stepAfter"
                            dataKey="onlineLine"
                            name="Alcançável"
                            stroke="#22c55e"
                            strokeDasharray="4 2"
                            dot={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
