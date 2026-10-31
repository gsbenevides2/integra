import React, { useCallback, useEffect, useState } from "react";

import type { LegStatus } from "@server/modules/motiva-trilhos/model";
import {
  DashboardData,
  useGlobalDrawer,
} from "@public/components/GlobalDrawerContext";
import { IconButton } from "@public/components/IconButton";
import { useToast } from "@public/components/Toast";

import { ArrowsUpDownIcon, Bars3Icon } from "@heroicons/react/24/outline";

import { getMotivaTrilhosEdenClient } from "./client";

const POLL_INTERVAL_MS = 15_000;
const LINE_COLORS: Record<string, string> = { "4": "#f5c518", "9": "#00a86b" };

function LegCard({ leg }: { leg: LegStatus }) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-gray-800 p-3 text-sm">
      <span
        className="rounded-md px-2 py-0.5 text-base font-bold text-gray-950"
        style={{ backgroundColor: LINE_COLORS[leg.line] }}
      >
        {leg.line}
      </span>
      <p className="flex-1 text-base">{leg.label}</p>
      {leg.etaMin === undefined ? (
        <span className="text-mist-400">Sem previsão</span>
      ) : (
        <span className="text-2xl font-semibold">
          {leg.etaMin === 0 ? "Chegando" : `${leg.etaMin} min`}
        </span>
      )}
    </div>
  );
}

function TripSection({ title, legs }: { title: string; legs: LegStatus[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-mist-400">{title}</p>
      {legs.map((leg) => (
        <LegCard key={leg.id} leg={leg} />
      ))}
    </div>
  );
}

export function MotivaTrilhosDashboard() {
  const [legs, setLegs] = useState<LegStatus[]>();
  const { showToast } = useToast();
  const globalDrawer = useGlobalDrawer();

  const fetchLegs = useCallback(async () => {
    const { data, error } = await getMotivaTrilhosEdenClient().api["motiva-trilhos"].get();
    if (error) showToast("Falha ao buscar os trens", "error");
    else setLegs(data.legs);
  }, [showToast]);

  useEffect(() => {
    fetchLegs();
    const interval = setInterval(fetchLegs, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchLegs]);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <IconButton onClick={() => globalDrawer.setIsOpen(true)} aria-label="Abrir menu">
          <Bars3Icon className="size-5" />
        </IconButton>
        <h1 className="text-xl">Trens da Motiva</h1>
      </div>

      {!legs ? (
        <p className="text-mist-400">Buscando próximos trens…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <TripSection title="Indo para o trabalho" legs={legs.filter((l) => l.trip === "to-work")} />
          <TripSection title="Voltando para casa" legs={legs.filter((l) => l.trip === "to-home")} />
        </div>
      )}
    </div>
  );
}

export const motivaTrilhosDashboard: DashboardData = {
  id: "motiva-trilhos",
  content: MotivaTrilhosDashboard,
  icon: ArrowsUpDownIcon,
  name: "Trens Motiva",
};
