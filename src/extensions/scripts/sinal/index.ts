import { db } from "core/db";
import onManual from "core/triggers/manual";
import { desc, eq, like } from "drizzle-orm";
import { platforms, platformStatusChecks } from "extensions/db/platform-status";
import { CacheClient } from "utils/cacheClient";
import sendDiscordMessage from "utils/discord/sendMessage";

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

export const sinalMonitor = onManual(
    {
        id: "sinal-monitor",
    },
    async (traceId) => {
        const plataforms = await getPlatformsWithLatestStatus();
        const apiHasIssue = plataforms.find((p) => p.name.includes("API"))?.status === "DOWN";
        const siteHasIssue = plataforms.find((p) => !p.name.includes("API"))?.status === "DOWN";
        let keyData = JSON.parse(
            (await CacheClient.get("sinal_discord_monitor")) ?? "[]",
        ) as string[];

        if (apiHasIssue && !keyData.includes("api")) {
            await sendDiscordMessage(
                `Atenção! A API de Grupo Sinal está com problemas de acesso. Verifique o status do site: https://api.gruposinal.com.br`,
                traceId,
            );
            keyData.push("api");
        } else if (!apiHasIssue) {
            keyData = keyData.filter((k) => k !== "api");
        }
        if (siteHasIssue && !keyData.includes("site")) {
            await sendDiscordMessage(
                `Atenção! O site de Grupo Sinal está com problemas de acesso. Verifique o status do site: https://www.gruposinal.com.br`,
                traceId,
            );
        } else if (!siteHasIssue) {
            keyData = keyData.filter((k) => k !== "site");
        }

        await CacheClient.set("sinal_discord_monitor", JSON.stringify(keyData));
    },
);
