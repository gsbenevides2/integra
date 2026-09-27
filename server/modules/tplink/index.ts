import Elysia from "elysia";

import { deviceBody, deviceHistoryQuery, interfaceBody, routerStatusHistoryQuery } from "./model";
import { TpLinkChecksService } from "./service/checks";
import { TpLinkDeviceService } from "./service/devices";
import { restartNetwork, syncSettings } from "./service/router";
import { TpLinkSettingsService } from "./service/settings";

export const tplinkRoutes = new Elysia({
  prefix: "/api/tplink",
  detail: { tags: ["TpLink"] },
})
  .get("/devices", async () => TpLinkDeviceService.listDevices(), {
    detail: { summary: "List devices", description: "Lists all registered TP-Link devices and their interfaces." },
  })
  .post(
    "/devices",
    async ({ body }) => TpLinkDeviceService.createDevice(body),
    {
      body: deviceBody,
      detail: { summary: "Create device", description: "Registers a new router or client device." },
    },
  )
  .put(
    "/devices/:id",
    async ({ params, body }) => TpLinkDeviceService.updateDevice(params.id, body),
    {
      body: deviceBody.partial(),
      detail: { summary: "Update device", description: "Updates a registered device." },
    },
  )
  .delete("/devices/:id", async ({ params }) => TpLinkDeviceService.deleteDevice(params.id), {
    detail: { summary: "Delete device", description: "Removes a device and its interfaces." },
  })
  .post(
    "/devices/:id/interface",
    async ({ params, body }) => TpLinkDeviceService.createInterface(params.id, body),
    {
      body: interfaceBody,
      detail: { summary: "Create interface", description: "Adds a network interface to a device." },
    },
  )
  .put(
    "/devices/:id/interface/:interfaceId",
    async ({ params, body }) =>
      TpLinkDeviceService.updateInterface(params.id, params.interfaceId, body),
    {
      body: interfaceBody.partial(),
      detail: { summary: "Update interface", description: "Updates a device's network interface." },
    },
  )
  .delete(
    "/devices/:id/interface/:interfaceId",
    async ({ params }) => TpLinkDeviceService.deleteInterface(params.interfaceId),
    {
      detail: { summary: "Delete interface", description: "Removes a device's network interface." },
    },
  )
  .get(
    "/devices/:id/history",
    async ({ params, query }) =>
      TpLinkChecksService.getDeviceHistory(params.id, { from: Number(query.from), to: Number(query.to) }),
    {
      query: deviceHistoryQuery,
      detail: { summary: "Device connection history", description: "Online/offline history for a device in a time range." },
    },
  )
  .post(
    "/router/sync",
    async () => {
      await syncSettings();
      return { ok: true };
    },
    { detail: { summary: "Sync router", description: "Runs a manual DHCP/firewall/status sync against the controller router." } },
  )
  .post(
    "/router/restart-network",
    async () => {
      await restartNetwork();
      return { ok: true };
    },
    { detail: { summary: "Restart network", description: "Reboots all registered routers (agents then controller)." } },
  )
  .get("/checks/latest", async () => TpLinkChecksService.getLatestCheck(), {
    detail: { summary: "Latest online check", description: "The most recent connected-devices snapshot." },
  })
  .get(
    "/settings/latest-router-status",
    async () => TpLinkSettingsService.getLatestRouterStatus(),
    { detail: { summary: "Latest router status", description: "Most recently collected router status (WAN, CPU, memory, uptime)." } },
  )
  .get(
    "/settings/router-status-history",
    async ({ query }) =>
      TpLinkSettingsService.getRouterStatusHistory(query.before ? new Date(query.before) : undefined),
    {
      query: routerStatusHistoryQuery,
      detail: { summary: "Router status history", description: "Paginated router status history." },
    },
  );
