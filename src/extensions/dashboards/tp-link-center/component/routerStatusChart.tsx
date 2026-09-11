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
    cpuUsage: number | null;
    memoryUsage: number | null;
    connectionStatus: string;
}

function formatTime(value: string) {
    return new Date(value).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function isConnected(status: string) {
    return status.toLowerCase() === "connected";
}

export function RouterStatusChart({ data }: { data: Point[] }) {
    const chartData = data.map((point) => ({
        ...point,
        connected: isConnected(point.connectionStatus) ? 100 : 0,
    }));

    return (
        <div className="bg-gray-800 rounded-md p-3 flex flex-col gap-2">
            <h3 className="text-sm font-semibold">CPU, memória e conexão do roteador</h3>
            <div className="w-full h-65">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.4} />
                        <XAxis
                            dataKey="collectedAt"
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
                                if (name === "Conexão") {
                                    return [item.payload.connectionStatus, name];
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
                            type="monotone"
                            dataKey="cpuUsage"
                            name="CPU"
                            stroke="#38bdf8"
                            dot={false}
                            connectNulls
                        />
                        <Line
                            type="monotone"
                            dataKey="memoryUsage"
                            name="Memória"
                            stroke="#c084fc"
                            dot={false}
                            connectNulls
                        />
                        <Line
                            type="step"
                            dataKey="connected"
                            name="Conexão"
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
