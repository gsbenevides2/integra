import React from "react";

import type { Hsv } from "@server/modules/tuya/color";
import { Input } from "@public/components/Input";
import { RingPicker } from "@public/components/RingPicker";
import { Slider } from "@public/components/Slider";
import { Switch } from "@public/components/Switch";

import {
  hexFromHsv,
  hsvFromHex,
  HUE_STOPS,
  hueHex,
  WHITE_START,
  WHITE_STOPS,
  WHITE_SWEEP,
  whiteHex,
} from "../../lampColor";
import type { Preset } from "../../types";
export interface PresetDraft {
  name: string;
  power: boolean;
  workMode: "white" | "colour";
  brightness: number;
  colorTemp: number;
  colorHex: string;
}

export const EMPTY_PRESET_DRAFT: PresetDraft = {
  name: "",
  power: true,
  workMode: "colour",
  brightness: 100,
  colorTemp: 50,
  colorHex: "#ff0000",
};

export function presetDraftFromPreset(preset: Preset): PresetDraft {
  return {
    name: preset.name,
    power: preset.power,
    workMode: preset.workMode === "white" ? "white" : "colour",
    brightness: preset.brightness ?? EMPTY_PRESET_DRAFT.brightness,
    colorTemp: preset.colorTemp ?? EMPTY_PRESET_DRAFT.colorTemp,
    colorHex: preset.colorHex ?? EMPTY_PRESET_DRAFT.colorHex,
  };
}

export function presetDraftToBody(draft: PresetDraft) {
  return {
    name: draft.name,
    power: draft.power,
    workMode: draft.workMode,
    brightness: draft.workMode === "colour" ? null : draft.brightness,
    colorTemp: draft.workMode === "colour" ? null : draft.colorTemp,
    colorHex: draft.workMode === "colour" ? draft.colorHex : null,
  };
}

interface Props {
  draft: PresetDraft;
  onChange: (draft: PresetDraft) => void;
}

export function PresetForm({ draft, onChange }: Props) {
  const hsv = hsvFromHex(draft.colorHex);
  const showColour = draft.workMode === "colour";

  const commitColor = (next: Hsv) =>
    onChange({ ...draft, colorHex: hexFromHsv(next) });

  return (
    <div className="flex flex-col items-center gap-4">
      <Input
        label="Nome"
        value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
        className="w-full"
      />

      <div className="flex gap-1 rounded-full bg-gray-800 p-1 text-xs">
        <TabButton
          active={draft.workMode === "white"}
          onClick={() => onChange({ ...draft, workMode: "white" })}
        >
          Branco
        </TabButton>
        <TabButton
          active={draft.workMode === "colour"}
          onClick={() => onChange({ ...draft, workMode: "colour" })}
        >
          Cor
        </TabButton>
      </div>

      {showColour ? (
        <RingPicker
          label="Matiz"
          colors={HUE_STOPS}
          value={hsv.h / 360}
          knobColor={hueHex(hsv)}
          onCommit={(value) => commitColor({ ...hsv, h: value * 360 })}
        />
      ) : (
        <RingPicker
          label="Temperatura de cor"
          colors={WHITE_STOPS}
          startAngle={WHITE_START}
          sweep={WHITE_SWEEP}
          value={draft.colorTemp / 100}
          knobColor={whiteHex(draft.colorTemp)}
          onCommit={(value) =>
            onChange({ ...draft, colorTemp: Math.round(value * 100) })
          }
        />
      )}

      <div className="flex w-full flex-col gap-3">
        <Slider
          label="Brilho"
          min={1}
          max={100}
          value={showColour ? Math.round(hsv.v * 100) : draft.brightness}
          track={`linear-gradient(to right, #000, ${showColour ? hueHex(hsv) : whiteHex(draft.colorTemp)})`}
          onCommit={(value) =>
            showColour
              ? commitColor({ ...hsv, v: value / 100 })
              : onChange({ ...draft, brightness: value })
          }
        />

        {showColour && (
          <Slider
            label="Saturação"
            min={0}
            max={100}
            value={Math.round(hsv.s * 100)}
            track={`linear-gradient(to right, #ffffff, ${hueHex({ ...hsv, s: 1 })})`}
            onCommit={(value) => commitColor({ ...hsv, s: value / 100 })}
          />
        )}
      </div>

      <Switch
        checked={draft.power}
        onChange={(power) => onChange({ ...draft, power })}
        label={
          draft.power
            ? "Liga a lâmpada ao aplicar"
            : "Mantém desligada ao aplicar"
        }
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        cursor-pointer rounded-full px-4 py-1 transition-colors
        ${
          active
            ? "bg-gray-700 text-mist-200"
            : `
              text-mist-400
              hover:text-mist-300
            `
        }
      `}
    >
      {children}
    </button>
  );
}
