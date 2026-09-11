import Elysia from "elysia";
import z from "zod";
import onHttp from "core/triggers/http";
import { getDeviceHistory, getLatestCheck } from "utils/tp-link-router/checks";
import {
    createDevice,
    createInterface,
    deleteDevice,
    deleteInterface,
    listDevices,
    updateDevice,
    updateInterface,
} from "utils/tp-link-router/devices";
import { restartNetwork, syncSettings } from "utils/tp-link-router/router";
import { getLatestRouterStatus, getRouterStatusHistory } from "utils/tp-link-router/settings";

const deviceBody = z.object({
    name: z.string(),
    brand: z.string(),
    type: z.enum(["router", "client"]),
    isController: z.boolean().optional(),
    routerPassword: z.string().nullable().optional(),
});

const interfaceBody = z.object({
    name: z.string(),
    mac: z.string(),
    ip: z.string(),
    reservedIp: z.boolean().optional(),
    allowList: z.boolean().optional(),
});

export const tpLinkCenterElysiaClient = new Elysia({ prefix: "/tp-link-center" })
    .get("/devices", async () => listDevices())
    .post("/devices", async ({ body }) => createDevice(body), { body: deviceBody })
    .put("/devices/:id", async ({ params, body }) => updateDevice(params.id, body), {
        body: deviceBody.partial(),
    })
    .delete("/devices/:id", async ({ params }) => deleteDevice(params.id))
    .post("/devices/:id/interface", async ({ params, body }) => createInterface(params.id, body), {
        body: interfaceBody,
    })
    .put(
        "/devices/:id/interface/:interfaceId",
        async ({ params, body }) => updateInterface(params.id, params.interfaceId, body),
        { body: interfaceBody.partial() },
    )
    .delete("/devices/:id/interface/:interfaceId", async ({ params }) =>
        deleteInterface(params.interfaceId),
    )
    .get(
        "/devices/:id/history",
        async ({ params, query }) =>
            getDeviceHistory(params.id, { from: Number(query.from), to: Number(query.to) }),
        { query: z.object({ from: z.string(), to: z.string() }) },
    )
    .post("/router/sync", async () => {
        await syncSettings();
        return { ok: true };
    })
    .post("/router/restart-network", async () => {
        await restartNetwork();
        return { ok: true };
    })
    .get("/checks/latest", async () => getLatestCheck())
    .get("/settings/latest-router-status", async () => getLatestRouterStatus())
    .get(
        "/settings/router-status-history",
        async ({ query }) =>
            getRouterStatusHistory(query.before ? new Date(query.before) : undefined),
        { query: z.object({ before: z.string().optional() }) },
    );

export const tpLinkCenterRoutes = onHttp(
    {
        id: "tp-link-center-routes",
        dontTrace: true,
    },
    tpLinkCenterElysiaClient,
);
