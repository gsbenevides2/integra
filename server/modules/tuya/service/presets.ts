import { db } from "@server/db";
import { tuyaPresets } from "@server/db/schema";

import { asc, eq } from "drizzle-orm";

import type { DeviceCommand } from "../model";
import { DeviceService } from "./devices";

export type Preset = typeof tuyaPresets.$inferSelect;

export interface PresetInput {
  name: string;
  power?: boolean;
  brightness?: number | null;
  colorTemp?: number | null;
  colorHex?: string | null;
  workMode?: string | null;
}

export abstract class PresetService {
  // Explicit constructor: bun counts an implicit one as an uncoverable function.
  constructor() {}

  static async list(): Promise<Preset[]> {
    return db.select().from(tuyaPresets).orderBy(asc(tuyaPresets.name));
  }

  static async get(id: string): Promise<Preset | null> {
    const [preset] = await db
      .select()
      .from(tuyaPresets)
      .where(eq(tuyaPresets.id, id))
      .limit(1);
    return preset ?? null;
  }

  static async getOrThrow(id: string): Promise<Preset> {
    const preset = await PresetService.get(id);
    if (!preset) throw new Error(`Preset ${id} not found`);
    return preset;
  }

  static async create(input: PresetInput): Promise<Preset> {
    const [created] = await db
      .insert(tuyaPresets)
      .values({
        name: input.name,
        power: input.power ?? true,
        brightness: input.brightness ?? null,
        colorTemp: input.colorTemp ?? null,
        colorHex: input.colorHex ?? null,
        workMode: input.workMode ?? null,
      })
      .returning();

    if (!created) throw new Error("Preset not created");
    return created;
  }

  static async update(
    id: string,
    input: Partial<PresetInput>,
  ): Promise<Preset | null> {
    const changes: Partial<typeof tuyaPresets.$inferInsert> = {};

    if (input.name !== undefined) changes.name = input.name;
    if (input.power !== undefined) changes.power = input.power;
    if (input.brightness !== undefined) changes.brightness = input.brightness;
    if (input.colorTemp !== undefined) changes.colorTemp = input.colorTemp;
    if (input.colorHex !== undefined) changes.colorHex = input.colorHex;
    if (input.workMode !== undefined) changes.workMode = input.workMode;

    if (Object.keys(changes).length === 0) return PresetService.get(id);

    const [updated] = await db
      .update(tuyaPresets)
      .set(changes)
      .where(eq(tuyaPresets.id, id))
      .returning();

    return updated ?? null;
  }

  static async delete(id: string): Promise<void> {
    await db.delete(tuyaPresets).where(eq(tuyaPresets.id, id));
  }

  static async apply(presetId: string, deviceId: string) {
    const preset = await PresetService.getOrThrow(presetId);
    const device = await DeviceService.getOrThrow(deviceId);
    return DeviceService.command(device, PresetService.toCommand(preset));
  }

  /**
   * In colour mode the hue/saturation/brightness all live in `colour_data`, so sending a plain
   * `brightness`/`colorTemp` alongside it would target a data point the lamp isn't using.
   */
  private static toCommand(preset: Preset): DeviceCommand {
    const command: DeviceCommand = { power: preset.power };
    if (preset.workMode === "colour" && preset.colorHex !== null) {
      command.colorHex = preset.colorHex;
      return command;
    }
    if (preset.colorTemp !== null) command.colorTemp = preset.colorTemp;
    if (preset.brightness !== null) command.brightness = preset.brightness;
    return command;
  }
}
