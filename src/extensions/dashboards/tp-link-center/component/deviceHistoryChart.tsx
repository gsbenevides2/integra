interface HistoryEntry {
    checkId: string;
    createdAt: number;
    online: boolean;
}

function formatTime(value: number) {
    return new Date(value).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function DeviceHistoryChart({ history }: { history: HistoryEntry[] }) {
    const sorted = history.slice().sort((a, b) => a.createdAt - b.createdAt);

    if (sorted.length === 0) {
        return <p className="text-sm text-mist-400">Sem histórico de conexão no período.</p>;
    }

    const onlineCount = sorted.filter((entry) => entry.online).length;
    const onlinePercent = Math.round((onlineCount / sorted.length) * 100);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex h-8 w-full gap-0.5 overflow-hidden rounded-sm">
                {sorted.map((entry) => (
                    <div
                        key={entry.checkId}
                        title={`${formatTime(entry.createdAt)} · ${entry.online ? "Online" : "Offline"}`}
                        className={`flex-1 min-w-[2px] rounded-[2px] ${entry.online ? "bg-green-500" : "bg-red-600"}`}
                    />
                ))}
            </div>
            <div className="flex items-center justify-between text-xs text-mist-400">
                <span>{formatTime(sorted[0]!.createdAt)}</span>
                <span>{onlinePercent}% online no período</span>
                <span>{formatTime(sorted[sorted.length - 1]!.createdAt)}</span>
            </div>
        </div>
    );
}
