import { db } from "@server/db";
import { birthdayEvents } from "@server/db/schema";

import { asc, eq } from "drizzle-orm";

import type { EventBody } from "../model";

export abstract class BirthdayService {
  // explicit ctor: bun cannot count an implicit one as covered
  protected constructor() {}

  static list() {
    return db
      .select()
      .from(birthdayEvents)
      .orderBy(asc(birthdayEvents.month), asc(birthdayEvents.day));
  }

  static async listToday(now = new Date()): Promise<string[]> {
    const rows = await BirthdayService.list();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    return rows
      .filter((e) => e.month === month && e.day === day)
      .map((e) => e.title);
  }

  static create(body: EventBody) {
    return db.insert(birthdayEvents).values(body).returning();
  }

  static async update(id: string, body: EventBody) {
    const [row] = await db
      .update(birthdayEvents)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(birthdayEvents.id, id))
      .returning();
    return row;
  }

  static async remove(id: string) {
    const [row] = await db
      .delete(birthdayEvents)
      .where(eq(birthdayEvents.id, id))
      .returning();
    return row;
  }
}
