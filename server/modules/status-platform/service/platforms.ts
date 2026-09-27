import { db } from "@server/db";
import { platforms, platformStatusChecks } from "@server/db/schema";

import { and, desc, eq, lt } from "drizzle-orm";

import type { PlatformBody } from "../model";
import { Fetchers } from "./fetchers";
import { buildSegments } from "./history";

const HISTORY_PAGE_SIZE = 100;

type PlatformRow = typeof platforms.$inferSelect;

function latestChecksSubquery() {
  return db
    .selectDistinctOn([platformStatusChecks.platformId], {
      platformId: platformStatusChecks.platformId,
      status: platformStatusChecks.status,
      problemDescription: platformStatusChecks.problemDescription,
      checkedAt: platformStatusChecks.checkedAt,
    })
    .from(platformStatusChecks)
    .orderBy(
      platformStatusChecks.platformId,
      desc(platformStatusChecks.checkedAt),
    )
    .as("latest_checks");
}

export abstract class StatusPlatformService {
  static async checkOne(platform: PlatformRow): Promise<void> {
    const fetcher = Fetchers[platform.type];
    const checkedAt = new Date();
    try {
      const result = await fetcher(platform.url);
      await db.insert(platformStatusChecks).values({
        platformId: platform.id,
        status: result.status,
        problemDescription:
          result.status === "DOWN" ? result.problemDescription : null,
        checkedAt,
      });
    } catch (error) {
      await db.insert(platformStatusChecks).values({
        platformId: platform.id,
        status: "DOWN",
        problemDescription:
          error instanceof Error ? error.message : "Unknown error occurred",
        checkedAt,
      });
    }
  }

  static async checkAll(): Promise<void> {
    const all = await db.select().from(platforms);
    await Promise.all(
      all.map((platform) => StatusPlatformService.checkOne(platform)),
    );
  }

  static list(platformId?: string) {
    const latestChecks = latestChecksSubquery();
    const query = db
      .select({
        id: platforms.id,
        name: platforms.name,
        url: platforms.url,
        type: platforms.type,
        status: latestChecks.status,
        problemDescription: latestChecks.problemDescription,
        lastCheckedAt: latestChecks.checkedAt,
      })
      .from(platforms)
      .leftJoin(latestChecks, eq(platforms.id, latestChecks.platformId));

    if (platformId) {
      return query.where(eq(platforms.id, platformId));
    }
    return query;
  }

  static async getHistory(platformId: string, before?: string) {
    const beforeDate = before ? new Date(before) : new Date();
    const checks = await db
      .select({
        status: platformStatusChecks.status,
        problemDescription: platformStatusChecks.problemDescription,
        checkedAt: platformStatusChecks.checkedAt,
      })
      .from(platformStatusChecks)
      .where(
        and(
          eq(platformStatusChecks.platformId, platformId),
          lt(platformStatusChecks.checkedAt, beforeDate),
        ),
      )
      .orderBy(desc(platformStatusChecks.checkedAt))
      .limit(HISTORY_PAGE_SIZE);

    const ordered = checks.slice().reverse();
    const segments = buildSegments(ordered);
    const oldestCheck = checks.at(-1);

    return {
      checks: ordered,
      segments,
      hasMore: checks.length === HISTORY_PAGE_SIZE,
      nextCursor: oldestCheck ? oldestCheck.checkedAt.toISOString() : null,
    };
  }

  static async create(body: PlatformBody) {
    const [created] = await db.insert(platforms).values(body).returning();
    if (!created) return [];
    await StatusPlatformService.checkOne(created);
    return StatusPlatformService.list(created.id);
  }

  static async update(id: string, body: PlatformBody) {
    const [updated] = await db
      .update(platforms)
      .set(body)
      .where(eq(platforms.id, id))
      .returning();
    if (!updated) return [];
    await StatusPlatformService.checkOne(updated);
    return StatusPlatformService.list(updated.id);
  }

  static remove(id: string) {
    return db.delete(platforms).where(eq(platforms.id, id)).returning();
  }
}
