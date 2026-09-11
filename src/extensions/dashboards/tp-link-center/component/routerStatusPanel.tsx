interface RouterStatus {
    wanIp: string;
    connectionStatus: string;
    connectionUptime: string;
    routerUptime: string;
    firmwareVersion: string;
    hardwareVersion: string;
    cpuUsage: number | null;
    memoryUsage: number | null;
    totalDownload: string | null;
    totalUpload: string | null;
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-xs text-mist-400">{label}</span>
            <span className="text-sm font-medium">{value}</span>
        </div>
    );
}

export function RouterStatusPanel({ status }: { status: RouterStatus | null }) {
    if (!status) {
        return (
            <div className="bg-gray-800 rounded-md p-3">
                <p className="text-sm text-mist-400">Nenhum status do roteador ainda.</p>
            </div>
        );
    }

    return (
        <div className="bg-gray-800 rounded-md p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Stat label="WAN IP" value={status.wanIp || "-"} />
            <Stat label="Conexão" value={status.connectionStatus || "-"} />
            <Stat label="Uptime Conexão" value={status.connectionUptime || "-"} />
            <Stat label="Uptime Roteador" value={status.routerUptime || "-"} />
            <Stat label="Firmware" value={status.firmwareVersion || "-"} />
            <Stat label="Hardware" value={status.hardwareVersion || "-"} />
            <Stat label="CPU" value={status.cpuUsage != null ? `${status.cpuUsage}%` : "-"} />
            <Stat
                label="Memória"
                value={status.memoryUsage != null ? `${status.memoryUsage}%` : "-"}
            />
            <Stat label="Download Total" value={status.totalDownload ?? "-"} />
            <Stat label="Upload Total" value={status.totalUpload ?? "-"} />
        </div>
    );
}
