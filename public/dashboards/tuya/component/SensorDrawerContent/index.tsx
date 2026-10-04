import React, { useCallback, useEffect, useState } from "react";

import { Button } from "@public/components/Button";
import { Input } from "@public/components/Input";
import { Switch } from "@public/components/Switch";
import { useToast } from "@public/components/Toast";

import { getTuyaEdenClient } from "../../client";
import type { Sensor, SensorReading } from "../../types";
import { SensorHistoryChart } from "./SensorHistoryChart";

const HISTORY_CODES = [
  "va_temperature",
  "va_humidity",
  "doorcontact_state",
  "pir_state",
  "battery_percentage",
  "battery_state",
];

// Sensors that only report a coarse battery level are plotted on a 1-3 scale.
const BATTERY_STATE_PERCENT: Record<string, string> = {
  low: "1",
  middle: "2",
  high: "3",
};

export function SensorDrawerContent({
  sensor,
  onChanged,
}: {
  sensor: Sensor;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState(sensor.name);
  const [isSaving, setIsSaving] = useState(false);
  const [readings, setReadings] = useState<SensorReading[]>([]);

  useEffect(() => setName(sensor.name), [sensor.id, sensor.name]);

  useEffect(() => {
    let cancelled = false;
    // One request per code: a shared window lets chatty codes (temperature)
    // push rare ones (battery, door) out of the page.
    Promise.all(
      HISTORY_CODES.map((code) =>
        getTuyaEdenClient()
          .api.tuya.sensors({ id: sensor.id })
          .history.get({ query: { code } })
          .then(({ data }) =>
            data
              ? ((data as unknown as { readings: SensorReading[] }).readings ??
                [])
              : [],
          ),
      ),
    ).then((all) => {
      if (!cancelled) setReadings(all.flat());
    });
    return () => {
      cancelled = true;
    };
  }, [sensor.id]);

  const save = useCallback(
    async (patch: { name?: string; enabled?: boolean; hidden?: boolean }) => {
      setIsSaving(true);
      const { error } = await getTuyaEdenClient()
        .api.tuya.sensors({ id: sensor.id })
        .put(patch);
      setIsSaving(false);
      if (error) {
        showToast("Falha ao salvar o sensor", "error");
        return;
      }
      showToast("Sensor salvo", "success");
      onChanged();
    },
    [sensor.id, showToast, onChanged],
  );

  const hasBatteryPercentage = readings.some(
    (reading) => reading.code === "battery_percentage",
  );

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-mist-300">Configuração</h3>
        <Input
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Switch
          checked={sensor.enabled}
          onChange={(enabled) => save({ enabled })}
          label={sensor.enabled ? "Coletando" : "Pausado"}
        />
        <Switch
          checked={sensor.hidden}
          onChange={(hidden) => save({ hidden })}
          label={sensor.hidden ? "Oculto no painel" : "Visível no painel"}
        />
        <p className="text-xs text-mist-400">
          Ocultar tira o sensor do painel sem parar a coleta, então o histórico
          segue sem buracos.
        </p>
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-mist-400">
          <div>
            <dt className="inline">Device ID: </dt>
            <dd className="inline font-mono">{sensor.tuyaDeviceId}</dd>
          </div>
          <div>
            <dt className="inline">Categoria: </dt>
            <dd className="inline">{sensor.category ?? "-"}</dd>
          </div>
          <div>
            <dt className="inline">Último evento: </dt>
            <dd className="inline">
              {sensor.lastEventAt
                ? new Date(sensor.lastEventAt).toLocaleString("pt-BR")
                : "nenhum"}
            </dd>
          </div>
        </dl>
        <div>
          <Button onClick={() => save({ name })} isLoading={isSaving}>
            Salvar
          </Button>
        </div>
      </section>

      <SensorHistoryChart
        readings={readings}
        code="va_temperature"
        label="Temperatura"
        scale={10}
        unit=" °C"
        color="#fb923c"
      />
      <SensorHistoryChart
        readings={readings}
        code="va_humidity"
        label="Umidade"
        unit=" %"
        color="#38bdf8"
      />
      <SensorHistoryChart
        readings={readings}
        code="doorcontact_state"
        label="Aberturas da porta"
        boolean
        eventLabel="aberturas"
        color="#fbbf24"
      />
      <SensorHistoryChart
        readings={readings.map((reading) =>
          reading.code === "pir_state"
            ? { ...reading, value: reading.value === "pir" ? "true" : "false" }
            : reading,
        )}
        code="pir_state"
        label="Detecções de movimento"
        boolean
        eventLabel="detecções"
        color="#a78bfa"
      />
      <SensorHistoryChart
        readings={
          hasBatteryPercentage
            ? readings
            : readings.map((reading) =>
                reading.code === "battery_state"
                  ? {
                      ...reading,
                      value: BATTERY_STATE_PERCENT[reading.value] ?? "NaN",
                    }
                  : reading,
              )
        }
        code={hasBatteryPercentage ? "battery_percentage" : "battery_state"}
        label="Bateria"
        levels={hasBatteryPercentage ? undefined : ["Baixa", "Média", "Alta"]}
        unit=" %"
        color="#22c55e"
      />

      {readings.length === 0 && (
        <p className="text-sm text-mist-400">
          Sem histórico ainda. O Integra grava os eventos que a Tuya envia assim
          que o sensor reporta uma mudança.
        </p>
      )}
    </div>
  );
}
