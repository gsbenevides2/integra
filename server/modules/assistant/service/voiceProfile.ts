import { db } from "@server/db";
import { assistantVoiceProfiles } from "@server/db/schema";

import { eq } from "drizzle-orm";

import type { VoiceProfile } from "../model";

/**
 * Each user's enrolled wake-word voice profile. The client extracts the
 * embeddings locally; the server only stores and returns them. Nothing here is
 * shared between users.
 */
export abstract class VoiceProfileService {
  // explicit ctor: bun cannot count an implicit one as covered
  constructor() {}

  static async get(userId: string): Promise<VoiceProfile> {
    const [row] = await db
      .select({
        embeddings: assistantVoiceProfiles.embeddings,
        dims: assistantVoiceProfiles.dims,
        modelId: assistantVoiceProfiles.modelId,
      })
      .from(assistantVoiceProfiles)
      .where(eq(assistantVoiceProfiles.userId, userId))
      .limit(1);
    if (!row) return { enrolled: false, embeddings: [], dims: 0, modelId: "" };
    return {
      enrolled: true,
      embeddings: row.embeddings,
      dims: row.dims,
      modelId: row.modelId,
    };
  }

  static async upsert(
    userId: string,
    embeddings: number[][],
    modelId: string,
  ): Promise<VoiceProfile> {
    const dims = embeddings[0]?.length ?? 0;
    await db
      .insert(assistantVoiceProfiles)
      .values({ userId, embeddings, dims, modelId })
      .onConflictDoUpdate({
        target: assistantVoiceProfiles.userId,
        set: { embeddings, dims, modelId, updatedAt: new Date() },
      });
    return { enrolled: true, embeddings, dims, modelId };
  }

  static async delete(userId: string): Promise<void> {
    await db
      .delete(assistantVoiceProfiles)
      .where(eq(assistantVoiceProfiles.userId, userId));
  }
}
