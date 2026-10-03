import React, { useCallback, useEffect, useState } from "react";

import { Button } from "@public/components/Button";
import {
  DashboardData,
  useGlobalDrawer,
} from "@public/components/GlobalDrawerContext";
import { IconButton } from "@public/components/IconButton";
import { useToast } from "@public/components/Toast";

import {
  Bars3Icon,
  PlayIcon,
  ServerStackIcon,
} from "@heroicons/react/24/outline";

import { getCronsEdenClient } from "./client";

interface CronJob {
  name: string;
  label: string;
  schedule: string;
  scheduleLabel: string;
}

interface CronListResponse {
  ok: boolean;
  jobs: CronJob[];
}

interface CronRunResponse {
  ok: boolean;
  job?: string;
  elapsed?: number;
  error?: string;
}

const REFRESH_INTERVAL_MS = 30000;

export function CronsDashboard() {
  const { showToast } = useToast();
  const globalDrawer = useGlobalDrawer();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  const [lastResult, setLastResult] = useState<
    Record<string, { elapsed: number } | { error: string }>
  >({});

  const fetchJobs = useCallback(
    async (useLoading: boolean) => {
      if (useLoading) setIsLoading(true);
      const client = getCronsEdenClient();
      const { data, error } = await client.api.crons.list.get();
      if (error) {
        showToast("Falha ao buscar crons", "error");
      } else {
        const resp = data as unknown as CronListResponse | undefined;
        if (resp?.ok) {
          setJobs(resp.jobs ?? []);
        }
      }
      if (useLoading) setIsLoading(false);
    },
    [showToast],
  );

  useEffect(() => {
    fetchJobs(true);
    const interval = setInterval(() => fetchJobs(false), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const runJob = useCallback(
    async ({ name: jobName, label }: CronJob) => {
      const updated = new Set(runningJobs);
      updated.add(jobName);
      setRunningJobs(updated);

      const client = getCronsEdenClient();
      const { data, error } = await client.api.crons.run({ jobName }).post();

      const afterRun = new Set(runningJobs);
      afterRun.delete(jobName);
      setRunningJobs(afterRun);

      if (error) {
        const errorMessage =
          "message" in error && typeof error.message === "string"
            ? error.message
            : "Erro desconhecido";
        setLastResult((prev) => ({
          ...prev,
          [jobName]: { error: errorMessage },
        }));
        showToast(`Falha ao executar ${label}`, "error");
        return;
      }

      const resp = data as unknown as CronRunResponse | undefined;
      if (!resp?.ok) {
        setLastResult((prev) => ({
          ...prev,
          [jobName]: { error: resp?.error ?? "Erro desconhecido" },
        }));
        showToast(resp?.error ?? `Falha ao executar ${label}`, "error");
      } else {
        setLastResult((prev) => ({
          ...prev,
          [jobName]: { elapsed: resp.elapsed! },
        }));
        showToast(`${label} concluído em ${resp.elapsed}ms`, "success");
      }
    },
    [runningJobs, showToast],
  );

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center gap-2">
        <IconButton
          onClick={() => globalDrawer.setIsOpen(true)}
          aria-label="Abrir menu"
        >
          <Bars3Icon className="size-5" />
        </IconButton>
        <h1 className="text-xl">Crons</h1>
      </div>

      {isLoading ? (
        <p className="text-sm text-mist-400">Carregando crons...</p>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <ServerStackIcon className="size-10 text-mist-500" />
          <p className="text-mist-200">Nenhum cron registrado</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md bg-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="
                  border-b border-gray-700 text-left text-xs text-mist-400
                "
              >
                <th className="px-3 py-2 font-normal">Job</th>
                <th className="px-3 py-2 font-normal">Schedule</th>
                <th className="px-3 py-2 font-normal">Última execução</th>
                <th className="px-3 py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.name}
                  className="
                    border-b border-gray-700
                    last:border-0
                    hover:bg-gray-700/40
                  "
                >
                  <td className="px-3 py-2">
                    <span className="text-mist-100">{job.label}</span>
                    <br />
                    <span className="text-[10px] text-mist-400">
                      {job.name}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-mist-300">
                      {job.scheduleLabel}
                    </span>
                    <br />
                    <span className="text-[10px] text-mist-500">
                      {job.schedule}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {runningJobs.has(job.name) ? (
                      <span className="text-xs text-yellow-300">
                        Executando...
                      </span>
                    ) : job.name in lastResult ? (
                      "elapsed" in lastResult[job.name] ? (
                        <span className="text-xs text-green-300">
                          OK —{" "}
                          {
                            (lastResult[job.name] as { elapsed: number })
                              .elapsed
                          }
                          ms
                        </span>
                      ) : (
                        <span className="text-xs text-red-300">Erro</span>
                      )
                    ) : (
                      <span className="text-xs text-mist-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="secondary"
                      isLoading={runningJobs.has(job.name)}
                      disabled={runningJobs.has(job.name)}
                      onClick={() => runJob(job)}
                    >
                      <PlayIcon className="size-4" /> Executar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export const cronsDashboard: DashboardData = {
  id: "crons",
  content: CronsDashboard,
  icon: ServerStackIcon,
  name: "Crons",
};
