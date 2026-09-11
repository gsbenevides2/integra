import { eq } from "drizzle-orm";
import { db } from "core/db";
import { tpLinkCenterDevices, tpLinkCenterInterfaces } from "core/db/schema";
import { decryptRouterPassword, encryptRouterPassword } from "./passwordCrypto";

export type DeviceType = "router" | "client";

export interface DeviceInterfaceInput {
    name: string;
    mac: string;
    ip: string;
    reservedIp?: boolean;
    allowList?: boolean;
}

export interface DeviceInput {
    name: string;
    brand: string;
    type: DeviceType;
    isController?: boolean;
    routerPassword?: string | null;
}

export async function listDevices() {
    const devices = await db.select().from(tpLinkCenterDevices);
    const interfaces = await db.select().from(tpLinkCenterInterfaces);
    const interfacesByDevice = new Map<string, typeof interfaces>();
    for (const iface of interfaces) {
        const list = interfacesByDevice.get(iface.deviceId) ?? [];
        list.push(iface);
        interfacesByDevice.set(iface.deviceId, list);
    }
    return devices.map((device) => ({
        ...device,
        routerPassword: undefined,
        interfaces: interfacesByDevice.get(device.id) ?? [],
    }));
}

export async function createDevice(body: DeviceInput): Promise<{ id: string }> {
    const created = await db.transaction(async (tx) => {
        if (body.type === "router" && body.isController) {
            await tx
                .update(tpLinkCenterDevices)
                .set({ isController: false })
                .where(eq(tpLinkCenterDevices.isController, true));
        }

        const encryptedPassword = body.routerPassword
            ? await encryptRouterPassword(body.routerPassword)
            : null;

        return tx
            .insert(tpLinkCenterDevices)
            .values({ ...body, routerPassword: encryptedPassword })
            .returning();
    });

    const id = created.at(0)?.id;
    if (!id) throw new Error("Id not generated");
    return { id };
}

export async function updateDevice(id: string, body: Partial<DeviceInput>): Promise<void> {
    await db.transaction(async (tx) => {
        if (body.type === "router" && body.isController) {
            await tx
                .update(tpLinkCenterDevices)
                .set({ isController: false })
                .where(eq(tpLinkCenterDevices.isController, true));
        }

        const encryptedPassword = body.routerPassword
            ? await encryptRouterPassword(body.routerPassword)
            : body.routerPassword === null
              ? null
              : undefined;

        const updateData: Record<string, unknown> = { ...body };
        if (encryptedPassword !== undefined) {
            updateData.routerPassword = encryptedPassword;
        }

        await tx.update(tpLinkCenterDevices).set(updateData).where(eq(tpLinkCenterDevices.id, id));
    });
}

export async function deleteDevice(id: string): Promise<void> {
    await db.delete(tpLinkCenterInterfaces).where(eq(tpLinkCenterInterfaces.deviceId, id));
    await db.delete(tpLinkCenterDevices).where(eq(tpLinkCenterDevices.id, id));
}

export async function createInterface(
    deviceId: string,
    body: DeviceInterfaceInput,
): Promise<{ id: string }> {
    const [device] = await db
        .select()
        .from(tpLinkCenterDevices)
        .where(eq(tpLinkCenterDevices.id, deviceId));
    if (!device) throw new Error("Device not found");

    if (device.type === "router") {
        const [existing] = await db
            .select()
            .from(tpLinkCenterInterfaces)
            .where(eq(tpLinkCenterInterfaces.deviceId, deviceId));
        if (existing) throw new Error("Router devices can only have one interface");
    }

    const created = await db
        .insert(tpLinkCenterInterfaces)
        .values({ ...body, deviceId })
        .returning();
    const id = created.at(0)?.id;
    if (!id) throw new Error("Id not generated");
    return { id };
}

export async function updateInterface(
    deviceId: string,
    interfaceId: string,
    body: Partial<DeviceInterfaceInput>,
): Promise<void> {
    const [device] = await db
        .select()
        .from(tpLinkCenterDevices)
        .where(eq(tpLinkCenterDevices.id, deviceId));

    if (device?.type === "router" && device.isController) {
        throw new Error("Controller router interface cannot be edited");
    }

    if (device?.type === "router") {
        const allowedFields: Record<string, unknown> = {};
        if (body.ip !== undefined) allowedFields.ip = body.ip;
        if (body.reservedIp !== undefined) allowedFields.reservedIp = body.reservedIp;
        await db
            .update(tpLinkCenterInterfaces)
            .set(allowedFields)
            .where(eq(tpLinkCenterInterfaces.id, interfaceId));
    } else {
        await db
            .update(tpLinkCenterInterfaces)
            .set(body)
            .where(eq(tpLinkCenterInterfaces.id, interfaceId));
    }
}

export async function deleteInterface(interfaceId: string): Promise<void> {
    await db.delete(tpLinkCenterInterfaces).where(eq(tpLinkCenterInterfaces.id, interfaceId));
}

export async function getDeviceNameOfMac(mac: string): Promise<string | undefined> {
    const [iface] = await db
        .select()
        .from(tpLinkCenterInterfaces)
        .where(eq(tpLinkCenterInterfaces.mac, mac));
    if (!iface) return undefined;
    const [device] = await db
        .select()
        .from(tpLinkCenterDevices)
        .where(eq(tpLinkCenterDevices.id, iface.deviceId));
    return device?.name;
}

export async function getControllerRouter(): Promise<{
    id: string;
    name: string;
    ip: string;
    password: string;
} | null> {
    const routers = await db
        .select()
        .from(tpLinkCenterDevices)
        .where(eq(tpLinkCenterDevices.type, "router"));
    const controllerDevice = routers.find((d) => d.isController);
    if (!controllerDevice || !controllerDevice.routerPassword) return null;

    const [iface] = await db
        .select()
        .from(tpLinkCenterInterfaces)
        .where(eq(tpLinkCenterInterfaces.deviceId, controllerDevice.id));
    if (!iface) return null;

    return {
        id: controllerDevice.id,
        name: controllerDevice.name,
        ip: iface.ip,
        password: await decryptRouterPassword(controllerDevice.routerPassword),
    };
}

export async function getAllRouters(): Promise<
    { ip: string; password: string; isController: boolean }[]
> {
    const devices = await db
        .select()
        .from(tpLinkCenterDevices)
        .where(eq(tpLinkCenterDevices.type, "router"));
    const interfaces = await db.select().from(tpLinkCenterInterfaces);

    const routers = await Promise.all(
        devices.map(async (d) => {
            const iface = interfaces.find((i) => i.deviceId === d.id);
            return {
                ip: iface?.ip,
                password: d.routerPassword
                    ? await decryptRouterPassword(d.routerPassword)
                    : undefined,
                isController: d.isController,
            };
        }),
    );

    return routers.filter((r): r is { ip: string; password: string; isController: boolean } =>
        Boolean(r.ip && r.password),
    );
}
