import { db } from "@server/db";
import { assistantUserSettings } from "@server/db/schema";

import { eq } from "drizzle-orm";

import type { AssistantSettings } from "../model";

/** Each user's own assistant settings; nothing here is shared between users. */
export abstract class AssistantSettingsService {
  // explicit ctor: bun cannot count an implicit one as covered
  constructor() {}

  static async get(userId: string): Promise<AssistantSettings> {
    const [row] = await db
      .select({ extraInstructions: assistantUserSettings.extraInstructions })
      .from(assistantUserSettings)
      .where(eq(assistantUserSettings.userId, userId))
      .limit(1);
    return { extraInstructions: row?.extraInstructions ?? "" };
  }

  static async update(
    userId: string,
    settings: AssistantSettings,
  ): Promise<AssistantSettings> {
    await db
      .insert(assistantUserSettings)
      .values({ userId, extraInstructions: settings.extraInstructions })
      .onConflictDoUpdate({
        target: assistantUserSettings.userId,
        set: {
          extraInstructions: settings.extraInstructions,
          updatedAt: new Date(),
        },
      });
    return settings;
  }
}
