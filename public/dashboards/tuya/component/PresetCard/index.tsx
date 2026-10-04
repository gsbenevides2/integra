import React from "react";

import { Button } from "@public/components/Button";

import { LightBulbIcon, PlayIcon } from "@heroicons/react/24/outline";

import { hsvFromHex, hueHex, whiteHex } from "../../lampColor";
import type { Preset } from "../../types";

interface Props {
  preset: Preset;
  onOpen: () => void;
  onApply: () => void;
  firstOnlineDeviceName?: string;
  onQuickApply?: () => void;
}

export function PresetCard({
  preset,
  onOpen,
  onApply,
  firstOnlineDeviceName,
  onQuickApply,
}: Props) {
  const isColour = preset.workMode === "colour" && preset.colorHex !== null;
  const hsv = isColour ? hsvFromHex(preset.colorHex) : null;
  const tint = hsv ? hueHex(hsv) : whiteHex(preset.colorTemp);
  const brightness = hsv ? Math.round(hsv.v * 100) : preset.brightness;

  return (
    <div className="flex flex-col gap-3 rounded-md bg-gray-800 p-3">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 cursor-pointer items-center gap-2 text-left"
      >
        <LightBulbIcon className="size-5 shrink-0" style={{ color: tint }} />
        <span className="truncate">{preset.name}</span>
      </button>

      <div className="flex items-center gap-2">
        <span
          className="size-4 shrink-0 rounded-full border border-gray-600"
          style={{ backgroundColor: tint }}
        />
        <span className="text-xs text-mist-400">
          {isColour ? tint : "Branco"}
          {brightness !== null && ` · ${brightness}%`}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {onQuickApply && firstOnlineDeviceName && (
          <Button variant="secondary" onClick={onQuickApply}>
            <PlayIcon className="size-4 shrink-0" /> Aplicar na{" "}
            {firstOnlineDeviceName}
          </Button>
        )}
        <Button variant="secondary" onClick={onApply}>
          <PlayIcon className="size-4" />{" "}
          {onQuickApply ? "Aplicar em outra" : "Aplicar"}
        </Button>
      </div>
    </div>
  );
}
