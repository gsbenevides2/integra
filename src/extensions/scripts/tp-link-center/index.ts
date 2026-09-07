import onCron from "core/triggers/cron";
import {
    convertRecordToAttributteArray,
    upsertMultipleSensors,
    type Sensor,
} from "utils/hass/createSensor";
import { getLatestCheck } from "utils/tp-link-center/getLatestCheck";
import { getLatestRouterStatus } from "utils/tp-link-center/getLatestRouterStatus";
import { listDevices } from "utils/tp-link-center/listDevices";
import { sync } from "utils/tp-link-center/sync";
import type { Device, LatestCheck, LatestRouterStatus } from "utils/tp-link-center/types";

function normalizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
}

function createRouterStatusSensors(routerStatus: LatestRouterStatus): Sensor[] {
    return [
        {
            sensorEntityId: "sensor.tp_link_wan_ip",
            state: routerStatus.wanIp,
            attributtes: convertRecordToAttributteArray({
                friendly_name: "TP-Link WAN IP",
                icon: "mdi:ip-network",
            }),
        },
        {
            sensorEntityId: "sensor.tp_link_connection_status",
            state: routerStatus.connectionStatus,
            attributtes: convertRecordToAttributteArray({
                friendly_name: "TP-Link Connection Status",
                icon: "mdi:wan",
            }),
        },
        {
            sensorEntityId: "sensor.tp_link_connection_uptime",
            state: routerStatus.connectionUptime,
            attributtes: convertRecordToAttributteArray({
                friendly_name: "TP-Link Connection Uptime",
                icon: "mdi:timer-outline",
            }),
        },
        {
            sensorEntityId: "sensor.tp_link_router_uptime",
            state: routerStatus.routerUptime,
            attributtes: convertRecordToAttributteArray({
                friendly_name: "TP-Link Router Uptime",
                icon: "mdi:timer-outline",
            }),
        },
        {
            sensorEntityId: "sensor.tp_link_firmware_version",
            state: routerStatus.firmwareVersion,
            attributtes: convertRecordToAttributteArray({
                friendly_name: "TP-Link Firmware Version",
                icon: "mdi:chip",
            }),
        },
        {
            sensorEntityId: "sensor.tp_link_hardware_version",
            state: routerStatus.hardwareVersion,
            attributtes: convertRecordToAttributteArray({
                friendly_name: "TP-Link Hardware Version",
                icon: "mdi:chip",
            }),
        },
        {
            sensorEntityId: "sensor.tp_link_cpu_usage",
            state: routerStatus.cpuUsage != null ? routerStatus.cpuUsage.toString() : "unknown",
            attributtes: convertRecordToAttributteArray({
                friendly_name: "TP-Link CPU Usage",
                state_class: "measurement",
                unit_of_measurement: "%",
                icon: "mdi:cpu-64-bit",
            }),
        },
        {
            sensorEntityId: "sensor.tp_link_memory_usage",
            state:
                routerStatus.memoryUsage != null ? routerStatus.memoryUsage.toString() : "unknown",
            attributtes: convertRecordToAttributteArray({
                friendly_name: "TP-Link Memory Usage",
                state_class: "measurement",
                unit_of_measurement: "%",
                icon: "mdi:memory",
            }),
        },
        {
            sensorEntityId: "sensor.tp_link_total_download",
            state: routerStatus.totalDownload ?? "unknown",
            attributtes: convertRecordToAttributteArray({
                friendly_name: "TP-Link Total Download",
                state_class: "total_increasing",
                icon: "mdi:download-network",
            }),
        },
        {
            sensorEntityId: "sensor.tp_link_total_upload",
            state: routerStatus.totalUpload ?? "unknown",
            attributtes: convertRecordToAttributteArray({
                friendly_name: "TP-Link Total Upload",
                state_class: "total_increasing",
                icon: "mdi:upload-network",
            }),
        },
    ];
}

function createDevicesRegistrySensors(devices: Device[]): Sensor[] {
    const routerCount = devices.filter((device) => device.type === "router").length;
    const clientCount = devices.filter((device) => device.type === "client").length;

    return [
        {
            sensorEntityId: "sensor.tp_link_devices_total",
            state: devices.length.toString(),
            attributtes: convertRecordToAttributteArray({
                friendly_name: "TP-Link Devices Total",
                state_class: "measurement",
                icon: "mdi:devices",
            }),
        },
        {
            sensorEntityId: "sensor.tp_link_devices_router_total",
            state: routerCount.toString(),
            attributtes: convertRecordToAttributteArray({
                friendly_name: "TP-Link Router Devices Total",
                state_class: "measurement",
                icon: "mdi:router-network",
            }),
        },
        {
            sensorEntityId: "sensor.tp_link_devices_client_total",
            state: clientCount.toString(),
            attributtes: convertRecordToAttributteArray({
                friendly_name: "TP-Link Client Devices Total",
                state_class: "measurement",
                icon: "mdi:devices",
            }),
        },
    ];
}

function createDevicesConnectivitySensors(devices: Device[], check: LatestCheck): Sensor[] {
    const onlineByMac = new Map(
        check.devices.map((onlineDevice) => [onlineDevice.mac, onlineDevice]),
    );

    const deviceSensors = devices.map<Sensor>((device) => {
        const onlineDevice = device.interfaces
            .map((iface) => onlineByMac.get(iface.mac))
            .find((entry) => entry !== undefined);

        return {
            sensorEntityId: `binary_sensor.tp_link_device_${normalizeName(device.name)}_connectivity`,
            state: onlineDevice ? "on" : "off",
            attributtes: convertRecordToAttributteArray({
                friendly_name: `${device.name} Connectivity`,
                device_class: "connectivity",
                brand: device.brand,
                type: device.type,
                ip: onlineDevice?.ip ?? "",
                router_interface: onlineDevice?.routerInterface ?? "",
            }),
        };
    });

    const summarySensors: Sensor[] = [
        {
            sensorEntityId: "sensor.tp_link_devices_online_count",
            state: check.devices.length.toString(),
            attributtes: convertRecordToAttributteArray({
                friendly_name: "TP-Link Devices Online",
                state_class: "measurement",
                icon: "mdi:lan-connect",
            }),
        },
        {
            sensorEntityId: "sensor.tp_link_last_check",
            state: new Date(check.createdAt).toISOString(),
            attributtes: convertRecordToAttributteArray({
                friendly_name: "TP-Link Last Check",
                device_class: "timestamp",
                icon: "mdi:clock-check-outline",
            }),
        },
    ];

    return [...deviceSensors, ...summarySensors];
}

export const syncTpLinkData = onCron(
    {
        cron: "0/2 * * * *", // every 2 minutes,
        id: "sync-tp-link-data",
    },
    async (_, traceId) => {
        await sync(traceId);
        const [devices, check, routerStatus] = await Promise.all([
            listDevices(traceId),
            getLatestCheck(traceId),
            getLatestRouterStatus(traceId),
        ]);

        const sensors: Sensor[] = [
            ...createRouterStatusSensors(routerStatus),
            ...createDevicesRegistrySensors(devices),
            ...createDevicesConnectivitySensors(devices, check),
        ];

        await upsertMultipleSensors(sensors, traceId, "default");
    },
);
