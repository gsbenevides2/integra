import React from "react";

import {
  DashboardData,
  useGlobalDrawer,
} from "@public/components/GlobalDrawerContext";
import { IconButton } from "@public/components/IconButton";

import { Bars3Icon, VideoCameraIcon } from "@heroicons/react/24/outline";

import { type Stats, useFrigateStats } from "./useFrigateStats";

const DISK_WARN = 0.9;

const gb = (mb: number) => `${(mb / 1024).toFixed(mb < 10240 ? 1 : 0)} GB`;

function uptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days > 0 ? `${days} d ${hours} h` : `${hours} h`;
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg bg-gray-800 p-3">
      <h2 className="text-sm font-semibold text-mist-300">{title}</h2>
      {children}
    </section>
  );
}

function Bar({ label, used, total }: { label: string; used: number; total: number }) {
  const ratio = total ? used / total : 0;
  const warn = ratio >= DISK_WARN;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-mist-400">
        <span>{label}</span>
        <span className={warn ? "text-amber-400" : ""}>
          {gb(used)} de {gb(total)} · {Math.round(ratio * 100)}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-700">
        <div
          className={`h-full ${warn ? "bg-amber-400" : "bg-blue-500"}`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}

function Row({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <dt className="text-mist-400">{term}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Content({ stats }: { stats: Stats }) {
  const cameras = Object.entries(stats.cameras);
  const update = stats.latestVersion !== stats.version.split("-")[0];
  return (
    <div className="
      grid stagger-in grid-cols-1 gap-3
      lg:grid-cols-2
    ">
      <Card title="Câmeras">
        <ul className="flex flex-col gap-3">
          {cameras.map(([name, cam]) => (
            <li key={name} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span
                  role="status"
                  aria-label={cam.fps > 0 ? "Online" : "Sem sinal"}
                  className={`
                    size-2.5 rounded-full
                    ${cam.fps > 0 ? "bg-green-500" : "bg-red-500"}
                  `}
                />
                <span className="font-medium">{name}</span>
              </div>
              <dl className="flex flex-col gap-0.5 pl-4.5">
                <Row term="Captura" value={`${cam.fps} fps`} />
                <Row
                  term="Frames descartados"
                  value={
                    <span className={cam.skippedFps > 0 ? "text-amber-400" : ""}>
                      {cam.skippedFps} fps
                    </span>
                  }
                />
                <Row
                  term="Detecção"
                  value={cam.detecting ? `${cam.detectionFps} fps` : "desligada"}
                />
              </dl>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-col gap-3">
        <Card title="Armazenamento">
          {stats.disk && (
            <Bar label="Gravações" used={stats.disk.used} total={stats.disk.total} />
          )}
          {stats.memory.map((volume) => (
            <Bar
              key={volume.name}
              label={volume.name}
              used={volume.used}
              total={volume.total}
            />
          ))}
        </Card>

        <Card title="Desempenho">
          <dl className="flex flex-col gap-0.5">
            {stats.detector && (
              <Row
                term={`Detector (${stats.detector.name})`}
                value={`${stats.detector.inferenceMs} ms por inferência`}
              />
            )}
            {stats.gpu && (
              <>
                <Row term={`GPU (${stats.gpu.name})`} value={stats.gpu.usage} />
                <Row term="Memória da GPU" value={stats.gpu.memory} />
              </>
            )}
          </dl>
        </Card>

        <Card title="Serviço">
          <dl className="flex flex-col gap-0.5">
            <Row term="Versão" value={stats.version.split("-")[0]} />
            {update && (
              <Row
                term="Atualização"
                value={<span className="text-amber-400">{stats.latestVersion} disponível</span>}
              />
            )}
            <Row term="No ar há" value={uptime(stats.uptime)} />
          </dl>
        </Card>
      </div>
    </div>
  );
}

export function FrigateDashboard() {
  const globalDrawer = useGlobalDrawer();
  const { stats, failed } = useFrigateStats();

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center gap-2">
        <IconButton
          onClick={() => globalDrawer.setIsOpen(true)}
          aria-label="Abrir menu"
        >
          <Bars3Icon className="size-5" />
        </IconButton>
        <h1 className="text-xl">Frigate</h1>
      </div>
      {stats ? (
        <Content stats={stats} />
      ) : (
        <p className="text-sm text-mist-400">
          {failed ? "Frigate indisponível" : "Carregando..."}
        </p>
      )}
    </div>
  );
}

export const frigateDashboard: DashboardData = {
  id: "frigate",
  content: FrigateDashboard,
  icon: VideoCameraIcon,
  name: "Frigate",
};
