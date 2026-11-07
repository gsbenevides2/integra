import React, { useCallback, useEffect, useState } from "react";

import { Button } from "@public/components/Button";
import {
  DashboardData,
  useGlobalDrawer,
} from "@public/components/GlobalDrawerContext";
import { IconButton } from "@public/components/IconButton";
import { useToast } from "@public/components/Toast";

import { ArrowPathIcon, Bars3Icon, TruckIcon } from "@heroicons/react/24/outline";

import { getTrainStatusEdenClient } from "./client";
import { Card } from "./component/Card";
import { CardSkeleton } from "./component/CardSkeleton";
import { HistoryModal } from "./component/HistoryModal";
import type { TrainLineStatus } from "./types";

const POLL_INTERVAL_MS = 4000;

interface TrainLineRow {
  lineCode: number;
  lineColor: string;
  situation: string;
  status: TrainLineStatus | null;
  description: string | null;
  checkedAt: Date | string | null;
}

export function TrainStatusDashboard() {
  const [historyLineCode, setHistoryLineCode] = useState<number>();
  const [lines, setLines] = useState<TrainLineRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const globalDrawer = useGlobalDrawer();

  const fetchLines = useCallback(
    async (useLoading: boolean) => {
      if (useLoading) setIsLoading(true);
      const client = getTrainStatusEdenClient();
      const { data, error } = await client.api["train-status"].lines.get();
      if (error) {
        showToast("Failed to fetch train lines", "error");
      } else {
        setLines((data as unknown as TrainLineRow[]) ?? []);
      }
      if (useLoading) setIsLoading(false);
    },
    [showToast],
  );

  const refresh = async () => {
    setIsRefreshing(true);
    const { error } = await getTrainStatusEdenClient().api["train-status"].refresh.post();
    if (error) showToast("Failed to refresh", "error");
    else await fetchLines(false);
    setIsRefreshing(false);
  };

  const lastChecked = lines
    .map((l) => (l.checkedAt ? new Date(l.checkedAt).getTime() : 0))
    .reduce((a, b) => Math.max(a, b), 0);

  useEffect(() => {
    fetchLines(true);
    const interval = setInterval(() => fetchLines(false), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchLines]);

  return (
    <div className="flex flex-col gap-4 p-3">
      <HistoryModal
        isOpen={historyLineCode !== undefined}
        onClose={() => setHistoryLineCode(undefined)}
        lineCode={historyLineCode}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
       <div className="flex items-center gap-2">
        <IconButton
          onClick={() => globalDrawer.setIsOpen(true)}
          aria-label="Abrir menu"
        >
          <Bars3Icon className="size-5" />
        </IconButton>
        <h1 className="text-xl">Train Status</h1>
       </div>
        <div className="flex items-center gap-2">
          {lastChecked > 0 && (
            <span className="text-xs text-mist-400">
              Última verificação: {new Date(lastChecked).toLocaleString("pt-BR")}
            </span>
          )}
        <Button
          variant="secondary"
          isLoading={isRefreshing}
          onClick={refresh}
        >
          <ArrowPathIcon className="size-4.5" />
          <span>Atualizar</span>
        </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="
          grid grid-cols-1 gap-2
          sm:grid-cols-2
          lg:grid-cols-3
        ">
          {Array.from({ length: 6 }).map((_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
      ) : lines.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <TruckIcon className="size-10 text-mist-500" />
          <p className="text-mist-200">No train lines tracked yet</p>
          <p className="text-sm text-mist-400">
            Data will appear here once the first status check runs.
          </p>
        </div>
      ) : (
        <div className="
          grid stagger-in grid-cols-1 gap-2
          sm:grid-cols-2
          lg:grid-cols-3
        ">
          {lines.map((line) => (
            <Card
              key={line.lineCode}
              lineCode={line.lineCode}
              situation={line.situation}
              status={line.status}
              description={line.description}
              onOpenHistory={() => setHistoryLineCode(line.lineCode)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const trainStatusDashboard: DashboardData = {
  id: "train-status",
  content: TrainStatusDashboard,
  icon: TruckIcon,
  name: "Train Status",
};
