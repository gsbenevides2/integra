import type { Device, DeviceState, Preset, Sensor } from "@public/dashboards/tuya/types";

export const state = (over: Partial<DeviceState> = {}): DeviceState => ({
  online: true,
  power: true,
  brightness: 40,
  colorTemp: 50,
  colorHex: null,
  workMode: "white",
  channels: null,
  ...over,
});

export const device = (
  over: Partial<Omit<Device, "state">> & { state?: Partial<DeviceState> } = {},
): Device => ({
  id: "d1",
  name: "Sala",
  tuyaDeviceId: "tuya-1",
  kind: "lamp",
  channelCount: null,
  enabled: true,
  hidden: false,
  lastSeenAt: null,
  createdAt: "2024-01-01T00:00:00Z",
  ...over,
  state: state(over.state),
});

export const preset = (over: Partial<Preset> = {}): Preset => ({
  id: "p1",
  name: "Leitura",
  power: true,
  brightness: 80,
  colorTemp: 30,
  colorHex: null,
  workMode: "white",
  createdAt: "2024-01-01T00:00:00Z",
  ...over,
});

export const sensor = (over: Partial<Sensor> = {}): Sensor => ({
  id: "s1",
  name: "Porta",
  tuyaDeviceId: "tuya-s1",
  kind: "door",
  category: "mcs",
  online: true,
  enabled: true,
  hidden: false,
  lastEventAt: null,
  lastSeenAt: null,
  readings: {},
  ...over,
});

/** The form control rendered right under a label (the ui Input has no id/for). */
export function field(label: string): HTMLInputElement & HTMLSelectElement {
  const { screen } = require("@testing-library/react");
  return screen.getByText(label).parentElement!.querySelector("input,select");
}

/** A button by text, ignoring the ConfirmDialog's own Cancelar/Confirmar. */
export function btn(text: string): HTMLElement {
  const { screen } = require("@testing-library/react");
  return (screen.getAllByText(text) as HTMLElement[]).find((e) => !e.closest(".max-w-sm"))!;
}
