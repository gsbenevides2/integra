import React, { useState } from "react";

import { Switch } from "@public/components/Switch";
import { useToast } from "@public/components/Toast";

import { getFrigateEdenClient } from "../../client";
import type { CameraState } from ".";

const LABELS: Record<string, string> = {
  detect: "Detecção de objetos",
  recordings: "Gravação",
  snapshots: "Capturas",
  audio: "Detecção de áudio",
  ptz_autotracker: "Rastreamento automático (PTZ)",
};

export function ControlsTab({
  name,
  state,
}: {
  name: string;
  state: CameraState | null;
}) {
  const { showToast } = useToast();
  // Local toggles on top of the camera's state. Copying the state in an effect
  // raced a click landing between the first render with switches and the
  // effect, which then reset the toggle.
  const [changed, setChanged] = useState<Record<string, boolean>>({});
  const features = { ...state?.features, ...changed };

  if (!state) return <p className="text-sm text-mist-400">Carregando...</p>;

  const toggle = async (feature: string, value: boolean) => {
    setChanged((current) => ({ ...current, [feature]: value }));
    const { error } = await getFrigateEdenClient()
      .api.frigate.cameras({ name })
      .features({ feature: feature as "detect" })
      .put({ value });
    if (error) {
      setChanged((current) => ({ ...current, [feature]: !value }));
      showToast("Falha ao alterar", "error");
    }
  };

  return (
    <div className="
      flex stagger-in flex-col divide-y divide-gray-700 rounded-lg bg-gray-800
      px-4 py-1
      sm:max-w-md
    ">
      {Object.keys(LABELS).map((feature) => (
        <div key={feature} className="py-3">
          <Switch
            label={LABELS[feature]}
            checked={features[feature] ?? false}
            onChange={(value) => toggle(feature, value)}
          />
        </div>
      ))}
    </div>
  );
}
