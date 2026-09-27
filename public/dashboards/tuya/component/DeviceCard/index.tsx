import React from "react";

import { Slider } from "@public/components/Slider";
import { Switch } from "@public/components/Switch";

import { BoltIcon, LightBulbIcon } from "@heroicons/react/24/outline";

import {
  brightnessCommand,
  currentHex,
  effectiveBrightness,
  isColourMode,
} from "../../lampColor";
import type { Device, DeviceCommand } from "../../types";

interface Props {
  device: Device;
  isBusy: boolean;
  onCommand: (command: DeviceCommand) => void;
  onOpen: () => void;
}

export function DeviceCard({ device, isBusy, onCommand, onOpen }: Props) {
  const { state } = device;
  const isOn = state.power === true;
  const channels = state.channels ?? {};
  const channelKeys = Object.keys(channels).sort(
    (a, b) => Number(a) - Number(b),
  );
  const anyChannelOn = channelKeys.some((key) => channels[key]);
  const isSwitch = device.kind === "switch";
  const tint = currentHex(state);
  const brightness = effectiveBrightness(state);

  return (
    <div
      className={`
        flex flex-col gap-3 rounded-md bg-gray-800 p-3
        ${
        device.hidden ? "opacity-50" : ""
      }
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 cursor-pointer items-center gap-2 text-left"
        >
          {device.kind === "switch" ? (
            <BoltIcon
              className={`
                size-5 shrink-0
                ${
                anyChannelOn ? "text-amber-300" : "text-mist-500"
              }
              `}
            />
          ) : (
            <LightBulbIcon
              className={`
                size-5 shrink-0
                ${isOn ? "" : "text-mist-500"}
              `}
              style={isOn ? { color: tint } : undefined}
            />
          )}
          <span className="truncate">{device.name}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {device.hidden && (
            <span className="
              rounded-full bg-gray-700 px-2 py-0.5 text-xs text-mist-300
            ">
              Oculta
            </span>
          )}
          <span
            className={`
              rounded-full px-2 py-0.5 text-xs
              ${
              state.online
                ? "bg-green-900 text-green-300"
                : "bg-red-950 text-red-300"
            }
            `}
          >
            {state.online ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      {isSwitch ? (
        channelKeys.length === 0 ? (
          <p className="text-xs text-mist-400">Sem canais conhecidos ainda.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {channelKeys.map((channel) => (
              <Switch
                key={channel}
                checked={channels[channel] === true}
                disabled={isBusy || !state.online}
                onChange={(checked) =>
                  onCommand({ channels: { [channel]: checked } })
                }
                label={
                  channelKeys.length === 1
                    ? channels[channel]
                      ? "Ligado"
                      : "Desligado"
                    : `Canal ${channel}`
                }
              />
            ))}
          </div>
        )
      ) : (
        <Switch
          checked={isOn}
          disabled={isBusy || !state.online}
          onChange={(checked) => onCommand({ power: checked })}
          label={isOn ? "Ligada" : "Desligada"}
        />
      )}

      {!isSwitch && brightness !== null && (
        <Slider
          label="Brilho"
          min={1}
          max={100}
          value={brightness}
          disabled={isBusy || !state.online}
          track={`linear-gradient(to right, #000, ${tint})`}
          onCommit={(value) => onCommand(brightnessCommand(state, value))}
        />
      )}

      {!isSwitch && state.colorHex && (
        <div className="flex items-center gap-2">
          <span
            className="size-4 shrink-0 rounded-full border border-gray-600"
            style={{ backgroundColor: tint }}
          />
          <span className="text-xs text-mist-400">
            {isColourMode(state) ? tint : "Modo branco"}
          </span>
        </div>
      )}
    </div>
  );
}
