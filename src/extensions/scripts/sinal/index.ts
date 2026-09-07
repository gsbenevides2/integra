import onHassEvent from "core/triggers/hass";
import sendDiscordMessage from "utils/discord/sendMessage";
import { getSensorState } from "utils/hass/createSensor";

interface EventData extends Record<string, unknown> {
    data: {
        entity_id: string;
        old_state: {
            state: string;
        };
        new_state: {
            state: string;
        };
    };
}
interface SensorResponse {
    entity_id: string;
    state: string;
    attributes: Record<string, unknown>;
    last_changed: string;
    last_updated: string;
    context: {
        id: string;
        user_id: string | null;
    };
}

const timeWait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DEFAULT_WAIT_TIME = 1000 * 60 * 5; // 5 minutes
const SITE_ENTITY_ID = "binary_sensor.status_plataform_grupo_sinal";
const HASS_INSTANCE_KEY = "default" as const;

export const sinalMonitor = onHassEvent<EventData>(
    {
        id: "sinal-monitor",
        instance: HASS_INSTANCE_KEY,
        eventType: "state_changed",
        entityId: SITE_ENTITY_ID,
    },
    async (event, traceId) => {
        const hasIssue = event?.data?.new_state?.state === "on";
        if (!hasIssue) {
            return;
        }
        await timeWait(DEFAULT_WAIT_TIME);
        const sensorData = await getSensorState<SensorResponse>(
            SITE_ENTITY_ID,
            traceId,
            HASS_INSTANCE_KEY,
        );
        const continueIssue = sensorData?.body?.state === "on";
        if (!continueIssue) {
            return;
        }
        await sendDiscordMessage(
            `Atenção! O site de Grupo Sinal está com problemas de acesso há mais de 5 minutos. Verifique o status do site: https://www.gruposinal.com.br`,
            traceId,
        );
    },
);

const API_ENTITY_ID = "binary_sensor.status_plataform_grupo_sinal_api";
export const sinalAPIMonitor = onHassEvent<EventData>(
    {
        id: "sinal-api-monitor",
        instance: HASS_INSTANCE_KEY,
        eventType: "state_changed",
        entityId: API_ENTITY_ID,
    },
    async (event, traceId) => {
        const hasIssue = event?.data?.new_state?.state === "on";
        if (!hasIssue) {
            return;
        }
        await timeWait(DEFAULT_WAIT_TIME);
        const sensorData = await getSensorState<SensorResponse>(
            API_ENTITY_ID,
            traceId,
            HASS_INSTANCE_KEY,
        );
        const continueIssue = sensorData?.body?.state === "on";
        if (!continueIssue) {
            return;
        }
        await sendDiscordMessage(
            `Atenção! A API de Grupo Sinal está com problemas de acesso há mais de 5 minutos. Verifique o status do site: https://api.gruposinal.com.br`,
            traceId,
        );
    },
);
