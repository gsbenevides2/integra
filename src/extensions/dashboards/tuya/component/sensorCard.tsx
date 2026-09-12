import {
    BoltIcon,
    ExclamationTriangleIcon,
    LockClosedIcon,
    LockOpenIcon,
    EyeIcon,
    SignalIcon,
    SunIcon,
} from "@heroicons/react/24/outline";
import type { Sensor } from "../types";

/** Tuya reports tenths of a degree and whole percent. */
function formatTemperature(raw: string | undefined): string | null {
    if (raw === undefined) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? `${(value / 10).toFixed(1)} °C` : null;
}

function formatHumidity(raw: string | undefined): string | null {
    if (raw === undefined) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? `${value.toFixed(0)} %` : null;
}

function batteryLabel(readings: Record<string, string>): string | null {
    if (readings.battery_percentage !== undefined) return `${readings.battery_percentage}%`;
    if (readings.battery_state !== undefined) {
        const map: Record<string, string> = { high: "alta", middle: "média", low: "baixa" };
        return map[readings.battery_state] ?? readings.battery_state;
    }
    return null;
}

function Reading({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col">
            <span className="text-lg">{value}</span>
            <span className="text-xs text-mist-400">{label}</span>
        </div>
    );
}

export function SensorCard({ sensor, onOpen }: { sensor: Sensor; onOpen: () => void }) {
    const { readings } = sensor;
    const battery = batteryLabel(readings);
    const tamper = readings.temper_alarm === "true";
    const isSilent = Object.keys(readings).length === 0;

    const doorOpen = readings.doorcontact_state === "true";
    // The PIR reports an enum of "pir" (movement) or "none" (clear).
    const motionRaw = readings.pir_state ?? readings.pir;
    const motionDetected = motionRaw === "pir" || motionRaw === "true";
    const temperature = formatTemperature(readings.va_temperature);
    const humidity = formatHumidity(readings.va_humidity);

    return (
        <button
            type="button"
            onClick={onOpen}
            className={`bg-gray-800 rounded-md p-3 flex flex-col gap-3 text-left cursor-pointer hover:bg-gray-700/60 transition-colors ${
                sensor.hidden ? "opacity-50" : ""
            }`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    {sensor.kind === "door" ? (
                        doorOpen ? (
                            <LockOpenIcon className="size-5 shrink-0 text-amber-300" />
                        ) : (
                            <LockClosedIcon className="size-5 shrink-0 text-mist-400" />
                        )
                    ) : sensor.kind === "temperature_humidity" ? (
                        <SunIcon className="size-5 shrink-0 text-sky-300" />
                    ) : sensor.kind === "motion" ? (
                        <EyeIcon
                            className={`size-5 shrink-0 ${
                                motionDetected ? "text-violet-300" : "text-mist-400"
                            }`}
                        />
                    ) : (
                        <SignalIcon className="size-5 shrink-0 text-mist-400" />
                    )}
                    <span className="truncate">{sensor.name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {sensor.hidden && (
                        <span className="text-xs rounded-full px-2 py-0.5 bg-gray-700 text-mist-300">
                            Oculto
                        </span>
                    )}
                    <span
                        className={`text-xs rounded-full px-2 py-0.5 ${
                            sensor.online
                                ? "bg-green-900 text-green-300"
                                : "bg-red-950 text-red-300"
                        }`}
                    >
                        {sensor.online ? "Online" : "Offline"}
                    </span>
                </div>
            </div>

            {sensor.kind === "door" && (
                <Reading label="Porta" value={doorOpen ? "Aberta" : "Fechada"} />
            )}

            {sensor.kind === "motion" && motionRaw !== undefined && (
                <Reading label="Movimento" value={motionDetected ? "Detectado" : "Nenhum"} />
            )}

            {sensor.kind === "temperature_humidity" && (
                <div className="flex gap-6">
                    {temperature && <Reading label="Temperatura" value={temperature} />}
                    {humidity && <Reading label="Umidade" value={humidity} />}
                </div>
            )}

            {isSilent && (
                <p className="text-xs text-mist-400">
                    Este dispositivo não publica nenhum dado — nem na nuvem, nem na rede local.
                    Verifique se ele mostra leitura no app Smart Life; se não mostrar, re-pareie.
                </p>
            )}

            <div className="flex items-center gap-3 text-xs text-mist-400">
                {battery && (
                    <span className="flex items-center gap-1">
                        <BoltIcon className="size-3.5" /> {battery}
                    </span>
                )}
                {tamper && (
                    <span className="flex items-center gap-1 text-amber-300">
                        <ExclamationTriangleIcon className="size-3.5" /> Violação
                    </span>
                )}
            </div>
        </button>
    );
}
