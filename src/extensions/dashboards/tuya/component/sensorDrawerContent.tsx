import { useCallback, useEffect, useState } from "react";
import { Button } from "core/ui/components/button";
import { Input } from "core/ui/components/input";
import { Switch } from "core/ui/components/switch";
import { useToast } from "core/ui/components/toast";
import { getTuyaEdenClient } from "extensions/scripts/tuya/client";
import type { Sensor, SensorReading } from "../types";
import { SensorHistoryChart } from "./sensorHistoryChart";

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
        getTuyaEdenClient()
            .tuya.sensors({ id: sensor.id })
            .history.get({ query: {} })
            .then(({ data }) => {
                if (cancelled || !data) return;
                setReadings((data as unknown as { readings: SensorReading[] }).readings ?? []);
            });
        return () => {
            cancelled = true;
        };
    }, [sensor.id]);

    const save = useCallback(
        async (patch: { name?: string; enabled?: boolean; hidden?: boolean }) => {
            setIsSaving(true);
            const { error } = await getTuyaEdenClient().tuya.sensors({ id: sensor.id }).put(patch);
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

    return (
        <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-mist-300">Configuração</h3>
                <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
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
                    Ocultar tira o sensor do painel sem parar a coleta, então o histórico segue sem
                    buracos.
                </p>
                <dl className="text-xs text-mist-400 flex flex-wrap gap-x-4 gap-y-1">
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
                label="Porta aberta"
                boolean
                color="#fbbf24"
            />
            <SensorHistoryChart
                readings={readings.map((reading) =>
                    reading.code === "pir_state"
                        ? { ...reading, value: reading.value === "pir" ? "true" : "false" }
                        : reading,
                )}
                code="pir_state"
                label="Movimento"
                boolean
                color="#a78bfa"
            />
            <SensorHistoryChart
                readings={readings}
                code="battery_percentage"
                label="Bateria"
                unit=" %"
                color="#22c55e"
            />

            {readings.length === 0 && (
                <p className="text-sm text-mist-400">
                    Sem histórico ainda. O Integra consulta o log de eventos da Tuya a cada 2
                    minutos e importa tudo o que aconteceu desde a última leitura.
                </p>
            )}
        </div>
    );
}
