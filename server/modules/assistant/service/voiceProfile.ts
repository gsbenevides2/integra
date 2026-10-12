import { db } from "@server/db";
import { assistantVoiceProfiles } from "@server/db/schema";

import { and, eq } from "drizzle-orm";

import { MAX_VOICES_PER_USER, type VoiceProfile } from "../model";

/**
 * A user's enrolled wake-word voices. A user may enrol several distinct voices;
 * the client extracts the embeddings locally and the server only stores and
 * returns them. Nothing here is shared between users.
 */
export abstract class VoiceProfileService {
  // explicit ctor: bun cannot count an implicit one as covered
  constructor() {}

  /** All of the user's enrolled voices, oldest first. */
  static async list(userId: string): Promise<VoiceProfile[]> {
    const rows = await db
      .select({
        id: assistantVoiceProfiles.id,
        label: assistantVoiceProfiles.label,
        embeddings: assistantVoiceProfiles.embeddings,
        dims: assistantVoiceProfiles.dims,
        modelId: assistantVoiceProfiles.modelId,
      })
      .from(assistantVoiceProfiles)
      .where(eq(assistantVoiceProfiles.userId, userId))
      .orderBy(assistantVoiceProfiles.updatedAt);
    return rows;
  }

  static async create(
    userId: string,
    label: string,
    embeddings: number[][],
    modelId: string,
  ): Promise<VoiceProfile> {
    const existing = await VoiceProfileService.list(userId);
    if (existing.length >= MAX_VOICES_PER_USER) {
      throw new Error(`No máximo ${MAX_VOICES_PER_USER} vozes por usuário`);
    }
    const dims = embeddings[0]?.length ?? 0;
    const [row] = await db
      .insert(assistantVoiceProfiles)
      .values({ userId, label, embeddings, dims, modelId })
      .returning({ id: assistantVoiceProfiles.id });
    return { id: row!.id, label, embeddings, dims, modelId };
  }

  static async rename(userId: string, id: string, label: string): Promise<void> {
    await db
      .update(assistantVoiceProfiles)
      .set({ label, updatedAt: new Date() })
      .where(
        and(
          eq(assistantVoiceProfiles.id, id),
          eq(assistantVoiceProfiles.userId, userId),
        ),
      );
  }

  static async delete(userId: string, id: string): Promise<void> {
    await db
      .delete(assistantVoiceProfiles)
      .where(
        and(
          eq(assistantVoiceProfiles.id, id),
          eq(assistantVoiceProfiles.userId, userId),
        ),
      );
  }
}
