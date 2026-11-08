import React from "react";

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

const CONNECTION_LABEL: Record<string, string> = {
  Connected: "Conectado",
  Disconnected: "Desconectado",
  Unknown: "Desconhecido",
};

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
      <div className="rounded-md bg-gray-800 p-3">
        <p className="text-sm text-mist-400">Nenhum status do roteador ainda.</p>
      </div>
    );
  }

  return (
    <div className="
      grid grid-cols-2 gap-3 rounded-md bg-gray-800 p-3
      sm:grid-cols-3
      lg:grid-cols-5
    ">
      <Stat label="WAN IP" value={status.wanIp || "-"} />
      <Stat
        label="Conexão"
        value={
          (CONNECTION_LABEL[status.connectionStatus] ?? status.connectionStatus) ||
          "-"
        }
      />
      <Stat label="Tempo conectado" value={status.connectionUptime || "-"} />
      <Stat label="Tempo do roteador" value={status.routerUptime || "-"} />
      <Stat label="Firmware" value={status.firmwareVersion || "-"} />
      <Stat label="Hardware" value={status.hardwareVersion || "-"} />
      <Stat label="CPU" value={status.cpuUsage != null ? `${status.cpuUsage}%` : "-"} />
      <Stat label="Memória" value={status.memoryUsage != null ? `${status.memoryUsage}%` : "-"} />
      <Stat label="Total baixado" value={status.totalDownload ?? "-"} />
      <Stat label="Total enviado" value={status.totalUpload ?? "-"} />
    </div>
  );
}
