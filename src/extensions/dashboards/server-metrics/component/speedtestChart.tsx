import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

interface Point {
    collectedAt: string;
    downloadMbps: number;
    uploadMbps: number;
    latencyMs: number;
}

function formatTime(value: string) {
    return new Date(value).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function SpeedtestChart({ data }: { data: Point[] }) {
    return (
        <div className="bg-gray-800 rounded-md p-3 flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Velocidade da internet (Mbps)</h3>
            <div className="w-full h-65">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.4} />
                        <XAxis
                            dataKey="collectedAt"
                            tickFormatter={formatTime}
                            tick={{ fontSize: 11 }}
                            stroke="#9ca3af"
                            minTickGap={40}
                        />
                        <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                        <Tooltip
                            labelFormatter={(value) => formatTime(String(value))}
                            formatter={(value, name) => [`${Number(value).toFixed(1)} Mbps`, name]}
                            contentStyle={{
                                backgroundColor: "#111827",
                                border: "1px solid #374151",
                                fontSize: 12,
                            }}
                        />
                        <Line
                            type="monotone"
                            dataKey="downloadMbps"
                            name="Download"
                            stroke="#38bdf8"
                            dot={false}
                        />
                        <Line
                            type="monotone"
                            dataKey="uploadMbps"
                            name="Upload"
                            stroke="#c084fc"
                            dot={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
