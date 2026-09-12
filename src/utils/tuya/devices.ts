import { asc, eq, sql } from "drizzle-orm";
import { db } from "core/db";
import { tuyaDevices } from "core/db/schema";
import type { BulbType } from "utils/tuya/capabilities";
import type { TuyaProtocolVersion } from "utils/tuya/protocol/types";
import { decryptLocalKey, encryptLocalKey } from "utils/tuya/secretCrypto";

export type Device = typeof tuyaDevices.$inferSelect;

/** A device as handed to the UI: everything except the secret. */
export type PublicDevice = Omit<Device, "localKey">;

export interface DeviceInput {
    name: string;
    tuyaDeviceId: string;
    localKey: string;
    ip?: string | null;
    protocolVersion?: TuyaProtocolVersion | null;
    bulbType?: BulbType | null;
    enabled?: boolean;
    hidden?: boolean;
}

/**
 * Built as an explicit allow-list rather than by omitting `localKey`, so a column added
 * later cannot leak a secret just by existing.
 */
function toPublic(device: Device): PublicDevice {
    return {
        id: device.id,
        name: device.name,
        tuyaDeviceId: device.tuyaDeviceId,
        ip: device.ip,
        protocolVersion: device.protocolVersion,
        kind: device.kind,
        bulbType: device.bulbType,
        channelCount: device.channelCount,
        enabled: device.enabled,
        hidden: device.hidden,
        online: device.online,
        lastSeenAt: device.lastSeenAt,
        createdAt: device.createdAt,
    };
}

export async function listDevices(): Promise<PublicDevice[]> {
    const devices = await db.select().from(tuyaDevices).orderBy(asc(tuyaDevices.id));
    return devices.map(toPublic);
}

export async function listEnabledDevices(): Promise<Device[]> {
    return db.select().from(tuyaDevices).where(eq(tuyaDevices.enabled, true));
}

export async function getDevice(id: string): Promise<Device | null> {
    const [device] = await db.select().from(tuyaDevices).where(eq(tuyaDevices.id, id)).limit(1);
    return device ?? null;
}

export async function getDeviceOrThrow(id: string): Promise<Device> {
    const device = await getDevice(id);
    if (!device) throw new Error(`Device ${id} not found`);
    return device;
}

/** Decrypts the stored local key for use on the wire. Never expose the result over HTTP. */
export async function revealLocalKey(device: Device): Promise<string> {
    return decryptLocalKey(device.localKey);
}

export async function createDevice(input: DeviceInput): Promise<PublicDevice> {
    const [created] = await db
        .insert(tuyaDevices)
        .values({
            name: input.name,
            tuyaDeviceId: input.tuyaDeviceId,
            localKey: await encryptLocalKey(input.localKey),
            ip: input.ip ?? null,
            protocolVersion: input.protocolVersion ?? null,
            bulbType: input.bulbType ?? null,
            enabled: input.enabled ?? true,
        })
        .returning();

    if (!created) throw new Error("Device not created");
    return toPublic(created);
}

export async function updateDevice(
    id: string,
    input: Partial<DeviceInput>,
): Promise<PublicDevice | null> {
    const changes: Partial<typeof tuyaDevices.$inferInsert> = {};

    if (input.name !== undefined) changes.name = input.name;
    if (input.tuyaDeviceId !== undefined) changes.tuyaDeviceId = input.tuyaDeviceId;
    if (input.ip !== undefined) changes.ip = input.ip;
    if (input.protocolVersion !== undefined) changes.protocolVersion = input.protocolVersion;
    if (input.bulbType !== undefined) changes.bulbType = input.bulbType;
    if (input.enabled !== undefined) changes.enabled = input.enabled;
    if (input.hidden !== undefined) changes.hidden = input.hidden;
    // Only re-encrypt when a new key was actually supplied, so an edit that leaves the
    // field blank keeps the stored one.
    if (input.localKey) changes.localKey = await encryptLocalKey(input.localKey);

    if (Object.keys(changes).length === 0) {
        const device = await getDevice(id);
        return device ? toPublic(device) : null;
    }

    const [updated] = await db
        .update(tuyaDevices)
        .set(changes)
        .where(eq(tuyaDevices.id, id))
        .returning();

    return updated ? toPublic(updated) : null;
}

export async function deleteDevice(id: string): Promise<void> {
    await db.delete(tuyaDevices).where(eq(tuyaDevices.id, id));
}

export async function markDeviceSeen(id: string, ip?: string): Promise<void> {
    await db
        .update(tuyaDevices)
        .set({ lastSeenAt: new Date(), ...(ip ? { ip } : {}) })
        .where(eq(tuyaDevices.id, id));
}

export async function saveDetectedProfile(
    id: string,
    protocolVersion: TuyaProtocolVersion,
    bulbType: BulbType | null,
): Promise<void> {
    await db.update(tuyaDevices).set({ protocolVersion, bulbType }).where(eq(tuyaDevices.id, id));
}

export interface DeviceFromCloud {
    tuyaDeviceId: string;
    name: string;
    localKey: string;
    online: boolean;
    kind: "lamp" | "switch";
    channelCount: number | null;
}

/**
 * Mirrors the account's bulbs into the local catalogue. The local key is refreshed on every
 * pass, which is what makes a re-paired bulb heal itself instead of failing its handshake
 * until somebody notices. A name edited here is kept, and so is anything the LAN discovered.
 */
export async function upsertDevicesFromCloud(devices: DeviceFromCloud[]): Promise<number> {
    if (devices.length === 0) return 0;

    const values = await Promise.all(
        devices.map(async (device) => ({
            tuyaDeviceId: device.tuyaDeviceId,
            name: device.name,
            localKey: await encryptLocalKey(device.localKey),
            online: device.online,
            kind: device.kind,
            channelCount: device.channelCount,
        })),
    );

    await db
        .insert(tuyaDevices)
        .values(values)
        .onConflictDoUpdate({
            target: tuyaDevices.tuyaDeviceId,
            set: {
                localKey: sql`EXCLUDED."localKey"`,
                online: sql`EXCLUDED.online`,
                kind: sql`EXCLUDED.kind`,
                channelCount: sql`EXCLUDED."channelCount"`,
            },
        });

    return values.length;
}
