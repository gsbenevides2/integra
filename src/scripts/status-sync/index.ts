import onCron from "triggers/cron";
import { updateSensor, type Sensor } from "utils/hass/createSensor";
import { sendStatusUpdates, type StatusPlataform } from "utils/hass/plus/sendStatus";
import { sendTrainUpdates } from "utils/hass/plus/sendTrains";
import { getServerStatus } from "utils/ssh/getServerStatus";
import type { SistemaStatus } from "utils/ssh/types";
import { getStatusOfPlataforms } from "utils/status/getStatus";
import { getTrainStatus } from "utils/train-status/getStatus";

const taskMountSensors = async (serverData: SistemaStatus): Promise<Sensor[]> => {
    const sensors: Sensor[] = [
        {
            sensorEntityId: "sensor.server_memory_used",
            state: Number(serverData.memoria.usada_mb).toString(),
            attributtes: [
                {
                    name: "state_class",
                    value: "measurement",
                },
                {
                    name: "device_class",
                    value: "data_size",
                },
                {
                    name: "unit_of_measurement",
                    value: "MB",
                },
                {
                    name: "icon",
                    value: "mdi:memory",
                },
                {
                    name: "friendly_name",
                    value: "Server Memory Used",
                },
            ],
        },
        {
            sensorEntityId: "sensor.server_memory_free",
            state: (
                Number(serverData.memoria.total_mb) - Number(serverData.memoria.usada_mb)
            ).toString(),
            attributtes: [
                {
                    name: "state_class",
                    value: "measurement",
                },
                {
                    name: "device_class",
                    value: "data_size",
                },
                {
                    name: "unit_of_measurement",
                    value: "MB",
                },
                {
                    name: "icon",
                    value: "mdi:memory",
                },
                {
                    name: "friendly_name",
                    value: "Server Memory Free",
                },
            ],
        },
        {
            sensorEntityId: "sensor.server_memory_total",
            state: Number(serverData.memoria.total_mb).toString(),
            attributtes: [
                {
                    name: "state_class",
                    value: "measurement",
                },
                {
                    name: "device_class",
                    value: "data_size",
                },
                {
                    name: "unit_of_measurement",
                    value: "MB",
                },
                {
                    name: "icon",
                    value: "mdi:memory",
                },
                {
                    name: "friendly_name",
                    value: "Server Memory Total",
                },
            ],
        },
        {
            sensorEntityId: "sensor.server_network_rx",
            state: Number(serverData.rede.rx_kbs).toString(),
            attributtes: [
                {
                    name: "state_class",
                    value: "measurement",
                },
                {
                    name: "device_class",
                    value: "data_rate",
                },
                {
                    name: "unit_of_measurement",
                    value: "kB/s",
                },
                {
                    name: "icon",
                    value: "mdi:download-network",
                },
                {
                    name: "friendly_name",
                    value: "Server Network RX",
                },
            ],
        },
        {
            sensorEntityId: "sensor.server_network_tx",
            state: Number(serverData.rede.tx_kbs).toString(),
            attributtes: [
                {
                    name: "state_class",
                    value: "measurement",
                },
                {
                    name: "device_class",
                    value: "data_rate",
                },
                {
                    name: "unit_of_measurement",
                    value: "kB/s",
                },
                {
                    name: "icon",
                    value: "mdi:upload-network",
                },
                {
                    name: "friendly_name",
                    value: "Server Network TX",
                },
            ],
        },
    ];

    const diskSensors = serverData.discos.flatMap<Sensor>((disk) => {
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
                attributtes: [
                    {
                        name: "state_class",
                        value: "measurement",
                    },
                    {
                        name: "device_class",
                        value: "data_size",
                    },
                    {
                        name: "unit_of_measurement",
                        value: unidade,
                    },
                    {
                        name: "icon",
                        value: "mdi:harddisk",
                    },
                    {
                        name: "friendly_name",
                        value: `Disk ${disk.filesystem} Used`,
                    },
                ],
            },
            {
                sensorEntityId: `sensor.server_disk_${id}_free`,
                state: livre_valor,
                attributtes: [
                    {
                        name: "state_class",
                        value: "measurement",
                    },
                    {
                        name: "device_class",
                        value: "data_size",
                    },
                    {
                        name: "unit_of_measurement",
                        value: unidade,
                    },
                    {
                        name: "icon",
                        value: "mdi:harddisk",
                    },
                    {
                        name: "friendly_name",
                        value: `Disk ${disk.filesystem} Free`,
                    },
                ],
            },
            {
                sensorEntityId: `sensor.server_disk_${id}_usage_percent`,
                state: usado_percent,
                attributtes: [
                    {
                        name: "state_class",
                        value: "measurement",
                    },
                    {
                        name: "device_class",
                        value: "data_size",
                    },
                    {
                        name: "unit_of_measurement",
                        value: "%",
                    },
                    {
                        name: "icon",
                        value: "mdi:chart-bar",
                    },
                    {
                        name: "friendly_name",
                        value: `Disk ${disk.filesystem} Usage %`,
                    },
                ],
            },
        ];
    });
    sensors.push(...diskSensors);

    return sensors;
};

export const statusSync = onCron(
    {
        cron: "*/2 * * * *",
        id: "status-sync",
    },
    async (_, traceId) => {
        const status = await getStatusOfPlataforms(traceId);
        const tansformatedStatus = status.map<StatusPlataform>((plataform) => ({
            hasProblem: plataform.status !== "OK",
            name: plataform.name,
            status_url: plataform.statusPage,
            problem_description: plataform.problemDescription,
        }));
        await sendStatusUpdates(tansformatedStatus, traceId);
        const trains = await getTrainStatus(traceId);
        await sendTrainUpdates(trains, traceId);

        const serverSensors = await getServerStatus(traceId);
        const hassSensors = await taskMountSensors(serverSensors);
        for (const hassSensor of hassSensors) {
            await updateSensor(hassSensor, traceId, "default");
        }
    },
);
