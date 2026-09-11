import { ArrowDownTrayIcon, ArrowUpTrayIcon, SignalIcon } from "@heroicons/react/24/outline";

interface Latest {
    downloadMbps: number;
    uploadMbps: number;
    latencyMs: number;
    collectedAt: string;
}

function formatTime(value: string) {
    return new Date(value).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function Stat({
    icon: Icon,
    label,
    value,
}: {
    icon: typeof ArrowDownTrayIcon;
    label: string;
    value: string;
}) {
    return (
        <div className="flex items-center gap-2">
            <Icon className="size-5 text-mist-400 shrink-0" />
            <div className="flex flex-col">
                <span className="text-xs text-mist-400">{label}</span>
                <span className="text-sm font-medium">{value}</span>
            </div>
        </div>
    );
}

export function SpeedtestLatest({ latest }: { latest: Latest | null }) {
    return (
        <div className="bg-gray-800 rounded-md p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Último teste (Cloudflare)</h3>
                {latest && (
                    <span className="text-xs text-mist-400">{formatTime(latest.collectedAt)}</span>
                )}
            </div>
            {latest ? (
                <div className="grid grid-cols-3 gap-3">
                    <Stat
                        icon={ArrowDownTrayIcon}
                        label="Download"
                        value={`${latest.downloadMbps.toFixed(1)} Mbps`}
                    />
                    <Stat
                        icon={ArrowUpTrayIcon}
                        label="Upload"
                        value={`${latest.uploadMbps.toFixed(1)} Mbps`}
                    />
                    <Stat
                        icon={SignalIcon}
                        label="Latência"
                        value={`${latest.latencyMs.toFixed(0)} ms`}
                    />
                </div>
            ) : (
                <p className="text-xs text-mist-400">Ainda não há teste de velocidade coletado.</p>
            )}
        </div>
    );
}
