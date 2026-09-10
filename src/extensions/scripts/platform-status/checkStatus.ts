import { db } from "core/db";
import { platforms, platformStatusChecks } from "extensions/db/platform-status";
import { Fetchers } from "./fetchers";

interface PlatformRow {
    id: string;
    url: string;
    type: keyof typeof Fetchers;
}

export async function checkPlatformStatus(platform: PlatformRow, traceId: string) {
    const fetcher = Fetchers[platform.type];
    const checkedAt = new Date();

    try {
        const result = await fetcher(platform.url, traceId);
        await db.insert(platformStatusChecks).values({
            platformId: platform.id,
            status: result.status,
            problemDescription: result.status === "DOWN" ? result.problemDescription : null,
            checkedAt,
        });
    } catch (error) {
        await db.insert(platformStatusChecks).values({
            platformId: platform.id,
            status: "DOWN",
            problemDescription: error instanceof Error ? error.message : "Unknown error occurred",
            checkedAt,
        });
    }
}

export async function checkPlatformsStatus(traceId: string) {
    const allPlatforms = await db.select().from(platforms);
    await Promise.all(allPlatforms.map((platform) => checkPlatformStatus(platform, traceId)));
}
