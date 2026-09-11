import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

interface Point {
    collectedAt: string;
    memoryUsedMb: number;
    memoryFreeMb: number;
}

function formatTime(value: string) {
    return new Date(value).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function MemoryChart({ data }: { data: Point[] }) {
    return (
        <div className="bg-gray-800 rounded-md p-3 flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Memória (MB)</h3>
            <div className="w-full h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
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
                            contentStyle={{
                                backgroundColor: "#111827",
                                border: "1px solid #374151",
                                fontSize: 12,
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="memoryUsedMb"
                            name="Usado"
                            stroke="#f97316"
                            fill="#f97316"
                            fillOpacity={0.25}
                        />
                        <Area
                            type="monotone"
                            dataKey="memoryFreeMb"
                            name="Livre"
                            stroke="#22c55e"
                            fill="#22c55e"
                            fillOpacity={0.15}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
