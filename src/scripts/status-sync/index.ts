import onCron from "triggers/cron";
import {
    convertRecordToAttributteArray,
    upsertMultipleSensors,
    type Sensor,
} from "utils/hass/createSensor";
import { numberToWords } from "utils/numbersToWords";
import { getServerStatus } from "utils/ssh/getServerStatus";
import type { SistemaStatus } from "utils/ssh/types";
import { getStatusOfPlataforms, type ReceivedStatusPlataform } from "utils/status/getStatus";
import { getTrainStatus } from "utils/train-status/getStatus";
import type { TrainStatusPlataform } from "utils/train-status/types";

function createServerStatsSensor(serverStatus: SistemaStatus): Sensor[] {
    const sensors: Sensor[] = [
        {
            sensorEntityId: "sensor.server_memory_used",
            state: Number(serverStatus.memoria.usada_mb).toString(),
            attributtes: convertRecordToAttributteArray({
                state_class: "measurement",
                device_class: "data_size",
                unit_of_measurement: "MB",
                icon: "mdi:memory",
                friendly_name: "Server Memory Used",
            }),
        },
        {
            sensorEntityId: "sensor.server_memory_free",
            state: (
                Number(serverStatus.memoria.total_mb) - Number(serverStatus.memoria.usada_mb)
            ).toString(),
            attributtes: convertRecordToAttributteArray({
                state_class: "measurement",
                device_class: "data_size",
                unit_of_measurement: "MB",
                icon: "mdi:memory",
                friendly_name: "Server Memory Free",
            }),
        },
        {
            sensorEntityId: "sensor.server_memory_total",
            state: Number(serverStatus.memoria.total_mb).toString(),
            attributtes: convertRecordToAttributteArray({
                state_class: "measurement",
                device_class: "data_size",
                unit_of_measurement: "MB",
                icon: "mdi:memory",
                friendly_name: "Server Memory Total",
            }),
        },
        {
            sensorEntityId: "sensor.server_network_rx",
            state: Number(serverStatus.rede.rx_kbs).toString(),
            attributtes: convertRecordToAttributteArray({
                state_class: "measurement",
                device_class: "data_rate",
                unit_of_measurement: "kB/s",
                icon: "mdi:download-network",
                friendly_name: "Server Network RX",
            }),
        },
        {
            sensorEntityId: "sensor.server_network_tx",
            state: Number(serverStatus.rede.tx_kbs).toString(),
            attributtes: convertRecordToAttributteArray({
                state_class: "measurement",
                device_class: "data_rate",
                unit_of_measurement: "kB/s",
                icon: "mdi:upload-network",
                friendly_name: "Server Network TX",
            }),
        },
    ];

    const diskSensors = serverStatus.discos.flatMap<Sensor>((disk) => {
        const id = disk.filesystem
            .replace(/[^a-zA-Z0-9]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_+|_+$/g, "")
            .toLowerCase();
        const usado_valor = Number(disk.usado.replace(/[^0-9.]/g, "")).toString();
        const livre_valor = Number(disk.livre.replace(/[^0-9.]/g, "")).toString();
        const usado_percent = Number(disk.uso_porcentagem.replace(/[^0-9.]/g, "")).toString();
        const unidade = disk.usado.replace(/[0-9.]/g, "") || "GB";

        return [
            {
                sensorEntityId: `sensor.server_disk_${id}_used`,
                state: usado_valor,
                attributtes: convertRecordToAttributteArray({
                    state_class: "measurement",
                    device_class: "data_size",
                    unit_of_measurement: unidade,
                    icon: "mdi:harddisk",
                    friendly_name: `Disk ${disk.filesystem} Used`,
                }),
            },
            {
                sensorEntityId: `sensor.server_disk_${id}_free`,
                state: livre_valor,
                attributtes: convertRecordToAttributteArray({
                    state_class: "measurement",
                    device_class: "data_size",
                    unit_of_measurement: unidade,
                    icon: "mdi:harddisk",
                    friendly_name: `Disk ${disk.filesystem} Free`,
                }),
            },
            {
                sensorEntityId: `sensor.server_disk_${id}_usage_percent`,
                state: usado_percent,
                attributtes: convertRecordToAttributteArray({
                    state_class: "measurement",
                    device_class: "data_size",
                    unit_of_measurement: "%",
                    icon: "mdi:chart-bar",
                    friendly_name: `Disk ${disk.filesystem} Usage %`,
                }),
            },
        ];
    });
    sensors.push(...diskSensors);

    return sensors;
}

function createTrainsSensors(linesData: TrainStatusPlataform[]): Sensor[] {
    return linesData.map<Sensor>((lineData) => {
        const lineCodeName = (numberToWords(lineData.codigo) || "").toLowerCase();
        return {
            state: lineData.status,
            attributtes: convertRecordToAttributteArray({
                friendly_name: `Linha ${lineData.codigo} - ${lineData.cor}`,
                icon: "mdi:train",
                status: lineData.status,
                codigo: lineData.codigo.toString(),
                cor: lineData.cor,
                descricao: lineData.descricao ?? "",
            }),
            sensorEntityId: `sensor.sp_train_${lineCodeName}`,
        };
    });
}

function createStatusSensors(plataforms: ReceivedStatusPlataform[]): Sensor[] {
    function normalizeName(name: string): string {
        return name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    }
    return plataforms.map<Sensor>((plataform) => ({
        state: plataform.status !== "OK" ? "on" : "off",
        attributtes: convertRecordToAttributteArray({
            friendly_name: plataform.name,
            device_class: "problem",
            status_url: plataform.statusPage,
            problem_description: plataform.problemDescription,
        }),
        sensorEntityId: `binary_sensor.status_plataform_${normalizeName(plataform.name)}`,
    }));
}

export const statusSync = onCron(
    {
        cron: "*/2 * * * *",
        id: "status-sync",
    },
    async (_, traceId) => {
        const status = await getStatusOfPlataforms(traceId);
        const statusSensors = createStatusSensors(status);
        await upsertMultipleSensors(statusSensors, traceId, "default");
        const trains = await getTrainStatus(traceId);
        const transSensors = createTrainsSensors(trains);
        await upsertMultipleSensors(transSensors, traceId, "default");

        const serverStatus = await getServerStatus(traceId);
        const serverSensors = await createServerStatsSensor(serverStatus);
        await upsertMultipleSensors(serverSensors, traceId, "default");
    },
);
