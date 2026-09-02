import { instrumentableFetch } from "instrumentation";
import { instanceSettings } from "triggers/hass/instances";
import type { InstanceKey, InstanceSetting } from "triggers/hass/types";

export interface Attribute {
    name: string;
    value: string;
}

export function convertRecordToAttributteArray(record: Record<string, string>): Attribute[] {
    return Object.entries(record).map(([name, value]) => ({
        name,
        value,
    }));
}

export interface Sensor {
    sensorEntityId: string;
    state: string;
    attributtes: Attribute[];
}

export async function upsertSensor(sensor: Sensor, traceId: string, instanceKey: InstanceKey) {
    const { host, token, useTLS } = instanceSettings[instanceKey] as InstanceSetting;
    const body = JSON.stringify({
        state: sensor.state,
        attributes: sensor.attributtes.reduce(
            (acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
            },
            {} as Record<string, string>,
        ),
    });
    const response = await instrumentableFetch(
        traceId,
        `${useTLS === false ? "http" : "https"}://${host}/api/states/${sensor.sensorEntityId}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body,
        },
    );
    return {
        status: response.status,
        body: await response.text(),
    };
}

export async function upsertMultipleSensors(
    sensors: Sensor[],
    traceId: string,
    instanceKey: InstanceKey,
) {
    return await Promise.all(sensors.map((sensor) => upsertSensor(sensor, traceId, instanceKey)));
}

export async function getSensorState<T>(
    sensorEntityId: string,
    traceId: string,
    instanceKey: InstanceKey,
) {
    const { host, token, useTLS } = instanceSettings[instanceKey] as InstanceSetting;
    const response = await instrumentableFetch(
        traceId,
        `${useTLS === false ? "http" : "https"}://${host}/api/states/${sensorEntityId}`,
        {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
            },
        },
    );
    return {
        status: response.status,
        body: (await response.json()) as T,
    };
}
