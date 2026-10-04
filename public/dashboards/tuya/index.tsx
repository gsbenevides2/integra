import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@public/components/Button";
import { Drawer } from "@public/components/Drawer";
import {
  DashboardData,
  useGlobalDrawer,
} from "@public/components/GlobalDrawerContext";
import { IconButton } from "@public/components/IconButton";
import { useToast } from "@public/components/Toast";

import { Bars3Icon, HomeIcon, PlusIcon } from "@heroicons/react/24/outline";

import { getFrigateEdenClient, getTuyaEdenClient } from "./client";
import { ApplyPresetModal } from "./component/ApplyPresetModal";
import { CameraCard } from "./component/CameraCard";
import { DeviceCard } from "./component/DeviceCard";
import { DeviceDrawerContent } from "./component/DeviceDrawerContent";
import { NewDeviceForm } from "./component/NewDeviceForm";
import { NewPresetForm } from "./component/NewPresetForm";
import { NewSensorForm } from "./component/NewSensorForm";
import { PresetCard } from "./component/PresetCard";
import { PresetDrawerContent } from "./component/PresetDrawerContent";
import { SensorCard } from "./component/SensorCard";
import { SensorDrawerContent } from "./component/SensorDrawerContent";
import type {
  Device,
  DeviceCommand,
  DeviceKind,
  DeviceState,
  Preset,
  Sensor,
} from "./types";

const POLL_INTERVAL_MS = 5000;

export interface NewDeviceDraft {
  name: string;
  tuyaDeviceId: string;
  kind: DeviceKind;
  channelCount: string;
}

export const EMPTY_DEVICE_DRAFT: NewDeviceDraft = {
  name: "",
  tuyaDeviceId: "",
  kind: "lamp",
  channelCount: "",
};

export interface NewSensorDraft {
  name: string;
  tuyaDeviceId: string;
}

export const EMPTY_SENSOR_DRAFT: NewSensorDraft = {
  name: "",
  tuyaDeviceId: "",
};

export function TuyaDashboard() {
  const { showToast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [cameras, setCameras] = useState<string[]>([]);
  const [openSensorId, setOpenSensorId] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [showHiddenDevices, setShowHiddenDevices] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busyDeviceIds, setBusyDeviceIds] = useState<string[]>([]);
  const [openDeviceId, setOpenDeviceId] = useState<string | null>(null);
  const [openPresetId, setOpenPresetId] = useState<string | null>(null);
  const [applyPresetId, setApplyPresetId] = useState<string | null>(null);
  const [showNewDeviceForm, setShowNewDeviceForm] = useState(false);
  const [showNewSensorForm, setShowNewSensorForm] = useState(false);
  const [showNewPresetForm, setShowNewPresetForm] = useState(false);
  const globalDrawer = useGlobalDrawer();

  // A command is answered by the device itself, so a poll landing mid-flight would
  // overwrite the optimistic value with a reading taken before the change.
  const inFlight = useRef(new Set<string>());

  const fetchAll = useCallback(async (useLoading: boolean) => {
    if (useLoading) setIsLoading(true);
    const client = getTuyaEdenClient();
    const [devicesRes, sensorsRes, presetsRes] = await Promise.all([
      client.api.tuya.devices.get({ query: { includeHidden: "true" } }),
      client.api.tuya.sensors.get({ query: { includeHidden: "true" } }),
      client.api.tuya.presets.get(),
    ]);
    if (devicesRes.data) {
      const fresh = devicesRes.data as unknown as Device[];
      setDevices((current) =>
        fresh.map((device) =>
          inFlight.current.has(device.id)
            ? (current.find((item) => item.id === device.id) ?? device)
            : device,
        ),
      );
    }
    if (sensorsRes.data) setSensors(sensorsRes.data as unknown as Sensor[]);
    if (presetsRes.data) setPresets(presetsRes.data as unknown as Preset[]);
    if (useLoading) setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchAll(true);
    const interval = setInterval(() => fetchAll(false), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Loaded once, outside the poll, so the live <img> streams are never remounted.
  useEffect(() => {
    getFrigateEdenClient()
      .api.frigate.cameras.get()
      .then(({ data }) => {
        if (data) setCameras(data as string[]);
      });
  }, []);

  const applyState = useCallback(
    (deviceId: string, state: Partial<DeviceState>) => {
      setDevices((current) =>
        current.map((device) =>
          device.id === deviceId
            ? { ...device, state: { ...device.state, ...state } }
            : device,
        ),
      );
    },
    [],
  );

  const sendCommand = useCallback(
    async (device: Device, command: DeviceCommand) => {
      const previous = device.state;
      applyState(device.id, command as Partial<DeviceState>);
      setBusyDeviceIds((current) => [...current, device.id]);
      inFlight.current.add(device.id);

      const client = getTuyaEdenClient();
      const { data, error } = await client.api.tuya
        .devices({ id: device.id })
        .command.post(command);

      setBusyDeviceIds((current) => current.filter((id) => id !== device.id));
      inFlight.current.delete(device.id);

      if (error || !data) {
        applyState(device.id, previous);
        showToast(`Falha ao comandar "${device.name}"`, "error");
        return;
      }
      applyState(device.id, data as unknown as DeviceState);
    },
    [applyState, showToast],
  );

  const openDevice =
    devices.find((device) => device.id === openDeviceId) ?? null;
  const visibleDevices = devices.filter((device) => !device.hidden);
  const hiddenDevices = devices.filter((device) => device.hidden);
  const shownDevices = showHiddenDevices ? devices : visibleDevices;
  const visibleLamps = visibleDevices.filter(
    (device) => device.kind === "lamp",
  );
  const firstOnlineLamp =
    visibleLamps.find((device) => device.state.online) ?? visibleLamps[0];
  const visibleSwitches = visibleDevices.filter(
    (device) => device.kind === "switch",
  );
  const shownLamps = shownDevices.filter((device) => device.kind === "lamp");
  const shownSwitches = shownDevices.filter(
    (device) => device.kind === "switch",
  );
  const openPreset =
    presets.find((preset) => preset.id === openPresetId) ?? null;
  const applyPreset =
    presets.find((preset) => preset.id === applyPresetId) ?? null;
  const openSensor =
    sensors.find((sensor) => sensor.id === openSensorId) ?? null;
  const visibleSensors = sensors.filter((sensor) => !sensor.hidden);
  const hiddenSensors = sensors.filter((sensor) => sensor.hidden);
  const shownSensors = showHidden ? sensors : visibleSensors;

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconButton
            onClick={() => globalDrawer.setIsOpen(true)}
            aria-label="Abrir menu"
          >
            <Bars3Icon className="size-5" />
          </IconButton>
          <h1 className="text-xl">Casa</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setShowNewPresetForm(true)}
          >
            <PlusIcon className="size-4" /> Novo modo
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowNewSensorForm(true)}
          >
            <PlusIcon className="size-4" /> Novo sensor
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowNewDeviceForm(true)}
          >
            <PlusIcon className="size-4" /> Novo dispositivo
          </Button>
        </div>
      </div>

      <NewDeviceForm
        isOpen={showNewDeviceForm}
        onCreated={() => fetchAll(false)}
        onClose={() => setShowNewDeviceForm(false)}
      />
      <NewSensorForm
        isOpen={showNewSensorForm}
        onCreated={() => fetchAll(false)}
        onClose={() => setShowNewSensorForm(false)}
      />
      <NewPresetForm
        isOpen={showNewPresetForm}
        onCreated={() => fetchAll(false)}
        onClose={() => setShowNewPresetForm(false)}
      />

      {isLoading ? (
        <p className="text-sm text-mist-400">Carregando...</p>
      ) : (
        <>
          {cameras.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-mist-300">
                Câmeras ({cameras.length})
              </h2>
              <div
                className="
                  grid grid-cols-[repeat(auto-fill,minmax(min(100%,480px),1fr))]
                  gap-3
                "
              >
                {cameras.map((name) => (
                  <CameraCard key={name} name={name} />
                ))}
              </div>
            </section>
          )}

          <div
            className="
              grid grid-cols-1 items-start gap-4
              lg:grid-cols-2
            "
          >
            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-mist-300">
                    Iluminação ({visibleLamps.length})
                  </h2>
                  {hiddenDevices.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setShowHiddenDevices((current) => !current)
                      }
                      className="
                        cursor-pointer text-xs text-mist-400 underline
                        underline-offset-2
                        hover:text-mist-300
                      "
                    >
                      {showHiddenDevices
                        ? "Esconder ocultas"
                        : `Mostrar ocultas (${hiddenDevices.length})`}
                    </button>
                  )}
                </div>
                {shownLamps.length === 0 ? (
                  <p className="text-sm text-mist-400">
                    {hiddenDevices.length > 0
                      ? "Todas as lâmpadas estão ocultas."
                      : "Nenhuma lâmpada ainda. Cadastre uma pelo device ID da Tuya."}
                  </p>
                ) : (
                  <div
                    className="
                      grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3
                    "
                  >
                    {shownLamps.map((device) => (
                      <DeviceCard
                        key={device.id}
                        device={device}
                        isBusy={busyDeviceIds.includes(device.id)}
                        onCommand={(command) => sendCommand(device, command)}
                        onOpen={() => setOpenDeviceId(device.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-mist-300">
                  Modos ({presets.length})
                </h2>
                {presets.length === 0 ? (
                  <p className="text-sm text-mist-400">
                    Nenhum modo ainda. Cadastre um jeito de deixar a lâmpada
                    para reaplicar quando quiser.
                  </p>
                ) : (
                  <div
                    className="
                      grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3
                    "
                  >
                    {presets.map((preset) => (
                      <PresetCard
                        key={preset.id}
                        preset={preset}
                        onOpen={() => setOpenPresetId(preset.id)}
                        onApply={() => setApplyPresetId(preset.id)}
                        firstOnlineDeviceName={firstOnlineLamp?.name}
                        onQuickApply={
                          firstOnlineLamp
                            ? () =>
                                sendCommand(firstOnlineLamp, {
                                  power: preset.power,
                                  brightness: preset.brightness ?? undefined,
                                  colorTemp: preset.colorTemp ?? undefined,
                                  colorHex: preset.colorHex ?? undefined,
                                  workMode: preset.workMode ?? undefined,
                                })
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-mist-300">
                    Sensores ({visibleSensors.length})
                  </h2>
                  {hiddenSensors.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowHidden((current) => !current)}
                      className="
                        cursor-pointer text-xs text-mist-400 underline
                        underline-offset-2
                        hover:text-mist-300
                      "
                    >
                      {showHidden
                        ? "Esconder ocultos"
                        : `Mostrar ocultos (${hiddenSensors.length})`}
                    </button>
                  )}
                </div>
                {shownSensors.length === 0 ? (
                  <p className="text-sm text-mist-400">
                    {hiddenSensors.length > 0
                      ? "Todos os sensores estão ocultos."
                      : "Nenhum sensor ainda. Cadastre um pelo device ID da Tuya."}
                  </p>
                ) : (
                  <div
                    className="
                      grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3
                    "
                  >
                    {shownSensors.map((sensor) => (
                      <SensorCard
                        key={sensor.id}
                        sensor={sensor}
                        onOpen={() => setOpenSensorId(sensor.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-mist-300">
                  Interruptores ({visibleSwitches.length})
                </h2>
                {shownSwitches.length === 0 ? (
                  <p className="text-sm text-mist-400">
                    Nenhum interruptor ainda. Cadastre um pelo device ID da
                    Tuya.
                  </p>
                ) : (
                  <div
                    className="
                      grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3
                    "
                  >
                    {shownSwitches.map((device) => (
                      <DeviceCard
                        key={device.id}
                        device={device}
                        isBusy={busyDeviceIds.includes(device.id)}
                        onCommand={(command) => sendCommand(device, command)}
                        onOpen={() => setOpenDeviceId(device.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </>
      )}

      <Drawer
        isOpen={!!openDevice}
        onClose={() => setOpenDeviceId(null)}
        title={openDevice?.name}
      >
        {openDevice && (
          <DeviceDrawerContent
            device={openDevice}
            isBusy={busyDeviceIds.includes(openDevice.id)}
            onCommand={(command) => sendCommand(openDevice, command)}
            onChanged={() => fetchAll(false)}
            onDeleted={() => {
              setOpenDeviceId(null);
              fetchAll(false);
            }}
          />
        )}
      </Drawer>
      <Drawer
        isOpen={!!openSensor}
        onClose={() => setOpenSensorId(null)}
        title={openSensor?.name}
      >
        {openSensor && (
          <SensorDrawerContent
            sensor={openSensor}
            onChanged={() => fetchAll(false)}
          />
        )}
      </Drawer>
      <Drawer
        isOpen={!!openPreset}
        onClose={() => setOpenPresetId(null)}
        title={openPreset?.name}
      >
        {openPreset && (
          <PresetDrawerContent
            preset={openPreset}
            onChanged={() => fetchAll(false)}
            onDeleted={() => {
              setOpenPresetId(null);
              fetchAll(false);
            }}
          />
        )}
      </Drawer>
      <ApplyPresetModal
        preset={applyPreset}
        devices={visibleLamps}
        onClose={() => setApplyPresetId(null)}
      />
    </div>
  );
}

export const tuyaDashboard: DashboardData = {
  id: "tuya",
  content: TuyaDashboard,
  icon: HomeIcon,
  name: "Casa",
};
