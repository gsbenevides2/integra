import { db } from "core/db";
import onManual from "core/triggers/manual";
import { desc, eq, like } from "drizzle-orm";
import { platforms, platformStatusChecks } from "extensions/db/platform-status";
import { CacheClient } from "utils/cacheClient";
import sendDiscordMessage from "utils/discord/sendMessage";

const CACHE_KEY = "sinal_discord_monitor";
const RECHECK_DELAY_MS = 5 * 60 * 1000;

type MonitorType = "api" | "site";

interface PendingDowntime {
    firstDetectedAt: string;
    confirmed: boolean;
}

type MonitorState = Partial<Record<MonitorType, PendingDowntime>>;

const MESSAGES: Record<MonitorType, string> = {
    api: "Atenção! A API de Grupo Sinal está com problemas de acesso. Verifique o status do site: https://api.gruposinal.com.br",
    site: "Atenção! O site de Grupo Sinal está com problemas de acesso. Verifique o status do site: https://www.gruposinal.com.br",
};

function latestChecksSubquery() {
    return db
        .selectDistinctOn([platformStatusChecks.platformId], {
            platformId: platformStatusChecks.platformId,
            status: platformStatusChecks.status,
            prxoblemDescription: platformStatusChecks.problemDescription,
            checkedAt: platformStatusChecks.checkedAt,
        })
        .from(platformStatusChecks)
        .orderBy(platformStatusChecks.platformId, desc(platformStatusChecks.checkedAt))
        .as("latest_checks");
}

async function getPlatformsWithLatestStatus() {
    const latestChecks = latestChecksSubquery();
    const query = db
        .select({
            name: platforms.name,
            status: latestChecks.status,
            problemDescription: latestChecks.prxoblemDescription,
        })
        .from(platforms)
        .leftJoin(latestChecks, eq(platforms.id, latestChecks.platformId))
        .where(like(platforms.name, "%Grupo Sinal%"));

    return query;
}

async function getMonitorState(): Promise<MonitorState> {
    const raw = await CacheClient.get(CACHE_KEY);
    if (!raw) return {};
    try {
        return JSON.parse(raw) as MonitorState;
    } catch {
        return {};
    }
}

async function saveMonitorState(state: MonitorState) {
    await CacheClient.set(CACHE_KEY, JSON.stringify(state));
}

async function processMonitorType(
    type: MonitorType,
    isDown: boolean,
    state: MonitorState,
    traceId: string,
) {
    const existing = state[type];

    if (!isDown) {
        // Recovered (or was never down): clear any pending/confirmed data we stored.
        if (existing) {
            delete state[type];
        }
        return;
    }

    if (!existing) {
        // First detection: record it in Redis and wait before alerting.
        state[type] = { firstDetectedAt: new Date().toISOString(), confirmed: false };
        return;
    }

    if (existing.confirmed) {
        // Already alerted for this downtime; nothing else to do until it recovers.
        return;
    }

    const elapsedMs = Date.now() - new Date(existing.firstDetectedAt).getTime();
    if (elapsedMs >= RECHECK_DELAY_MS) {
        // Still down after the wait window: confirm and alert.
        await sendDiscordMessage(MESSAGES[type], traceId);
        state[type] = { ...existing, confirmed: true };
    }
}

export const sinalMonitor = onManual(
    {
        id: "sinal-monitor",
    },
    async (traceId) => {
        const platformsData = await getPlatformsWithLatestStatus();
        const apiIsDown = platformsData.find((p) => p.name.includes("API"))?.status === "DOWN";
        const siteIsDown = platformsData.find((p) => !p.name.includes("API"))?.status === "DOWN";

        const state = await getMonitorState();
        await processMonitorType("api", apiIsDown, state, traceId);
        await processMonitorType("site", siteIsDown, state, traceId);
        await saveMonitorState(state);
    },
);
