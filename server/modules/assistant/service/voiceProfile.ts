import { db } from "@server/db";
import { assistantVoiceProfiles, DEFAULT_VOICE_LABEL } from "@server/db/schema";

import { and, eq } from "drizzle-orm";

import { type LegacyVoiceProfile, MAX_VOICES_PER_USER, type VoiceProfile } from "../model";

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

  // Legacy single-profile API (`/voice-profile`), kept for the Android app,
  // which still enrols one voice and checks against one profile.

  /**
   * Every voice of the most recently enrolled model, flattened into one
   * profile: a client checking against it accepts any of the user's voices.
   */
  static async legacyProfile(userId: string): Promise<LegacyVoiceProfile> {
    const voices = await VoiceProfileService.list(userId);
    const latest = voices.at(-1);
    if (!latest) return { enrolled: false, embeddings: [], dims: 0, modelId: "" };
    return {
      enrolled: true,
      embeddings: voices
        .filter((voice) => voice.modelId === latest.modelId)
        .flatMap((voice) => voice.embeddings),
      dims: latest.dims,
      modelId: latest.modelId,
    };
  }

  /** Re-records the default voice ("Minha voz"), creating it if missing. */
  static async saveDefault(
    userId: string,
    embeddings: number[][],
    modelId: string,
  ): Promise<LegacyVoiceProfile> {
    const [existing] = await db
      .select({ id: assistantVoiceProfiles.id })
      .from(assistantVoiceProfiles)
      .where(defaultVoiceOf(userId))
      .limit(1);
    if (existing) {
      const dims = embeddings[0]?.length ?? 0;
      await db
        .update(assistantVoiceProfiles)
        .set({ embeddings, dims, modelId, updatedAt: new Date() })
        .where(eq(assistantVoiceProfiles.id, existing.id));
    } else {
      await VoiceProfileService.create(userId, DEFAULT_VOICE_LABEL, embeddings, modelId);
    }
    return VoiceProfileService.legacyProfile(userId);
  }

  /** Removes the default voice only; voices added on the web stay. */
  static async deleteDefault(userId: string): Promise<void> {
    await db.delete(assistantVoiceProfiles).where(defaultVoiceOf(userId));
  }
}

function defaultVoiceOf(userId: string) {
  return and(
    eq(assistantVoiceProfiles.userId, userId),
    eq(assistantVoiceProfiles.label, DEFAULT_VOICE_LABEL),
  );
}
