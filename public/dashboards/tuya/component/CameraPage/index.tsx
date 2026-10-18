import React, { useEffect, useState } from "react";

import { IconButton } from "@public/components/IconButton";
import { SegmentedControl } from "@public/components/SegmentedControl";

import { ArrowLeftIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";

import { getFrigateEdenClient } from "../../client";
import { ControlsTab } from "./ControlsTab";
import { EventsTab } from "./EventsTab";
import { HistoryTab } from "./HistoryTab";
import { LiveTab } from "./LiveTab";

const TABS = [
  ["live", "Ao vivo"],
  ["events", "Eventos"],
  ["history", "Histórico"],
  ["controls", "Controles"],
] as const;

type Tab = (typeof TABS)[number][0];

export interface CameraState {
  ptz: { features: string[]; presets: string[] } | null;
  features: Record<string, boolean>;
}

export function CameraPage({
  name,
  onBack,
}: {
  name: string;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>("live");
  const [state, setState] = useState<CameraState | null>(null);

  useEffect(() => {
    getFrigateEdenClient()
      .api.frigate.cameras({ name })
      .state.get()
      .then(({ data }) => {
        if (data) setState(data as CameraState);
      });
  }, [name]);

  return (
    <div className="flex animate-fade-in flex-col gap-4 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconButton onClick={onBack} aria-label="Voltar">
            <ArrowLeftIcon className="size-5" />
          </IconButton>
          <h1 className="text-xl">{name}</h1>
        </div>
        <a
          href={`/api/frigate/cameras/${name}/goToFrigate`}
          target="_blank"
          rel="noopener noreferrer"
          className="
            flex items-center gap-1 text-sm text-mist-400
            hover:text-mist-300
          "
        >
          Frigate <ArrowTopRightOnSquareIcon className="size-4" />
        </a>
      </div>
      <SegmentedControl
        options={TABS}
        value={tab}
        onChange={setTab}
        className="
          rounded-lg bg-gray-800 text-sm
          sm:max-w-md
        "
        pillClassName="rounded-md bg-gray-950"
        buttonClassName="px-3 py-1.5"
      />
      <div key={tab} className="animate-fade-in">
        {tab === "live" && <LiveTab name={name} ptz={state?.ptz ?? null} />}
        {tab === "events" && <EventsTab name={name} />}
        {tab === "history" && <HistoryTab name={name} />}
        {tab === "controls" && <ControlsTab name={name} state={state} />}
      </div>
    </div>
  );
}
