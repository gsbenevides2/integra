import { db } from "@server/db";
import {
  authResourceGrants,
  authRouteGrants,
  authUsers,
  tuyaDevices,
  tuyaPresets,
  tuyaSensors,
} from "@server/db/schema";
import { getLogger, logWarn } from "@server/instrumentation/instrumentLogger";
import {
  type GuardedRoute,
  guardedRouteKeys,
  guardedRoutes,
  isRegistryEmpty,
  type ResourceAction,
  type ResourceType,
  VALID_ACTIONS,
} from "@server/shared/authz";

import { and, eq } from "drizzle-orm";

import { jobRegistry } from "../../../cron";
import { frigateFetch } from "../../frigate/service/frigate";
import { MANAGER_ROUTE_KEY } from "../constants";

const log = getLogger("permissions");

/**
 * Startup-only, defensive checks: never throws. Warns when the manager route
 * key is missing from the registry (a rename) or no user holds it yet (the
 * normal state before the bootstrap SQL is run).
 */
export async function runAuthzStartupChecks(): Promise<void> {
  if (!guardedRouteKeys().includes(MANAGER_ROUTE_KEY)) {
    logWarn(
      log,
      `[authz] ${MANAGER_ROUTE_KEY} is not registered; the last-manager lockout is inactive. See docs/configuration.md (bootstrap section).`,
    );
    return;
  }
  try {
    const managers = await managerUserIds();
    if (managers.length === 0) {
      logWarn(
        log,
        "[authz] no user holds the permission manager route grant yet. Run server/db/sql/auth-bootstrap.sql. See docs/configuration.md (bootstrap section).",
      );
    }
  } catch (error) {
    logWarn(
      log,
      "[authz] could not check for a permission manager at startup; continuing.",
      { "error.message": error instanceof Error ? error.message : String(error) },
    );
  }
}

export interface UserRow {
  id: string;
  uid: string;
  username: string;
  createdAt: Date;
  updatedAt: Date;
}

export type GrantStatus = "ok" | "orphaned" | "unverified";

export interface RouteGrantView {
  id: string;
  routeKey: string;
  status: "ok" | "orphaned";
}

export interface ResourceGrantView {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  action: ResourceAction;
  label: string | null;
  status: GrantStatus;
}

export interface ResourceOption {
  resourceType: ResourceType;
  resourceId: string;
  label: string;
  actions: ResourceAction[];
}

export interface Catalog {
  /** id → label for every resource without an external source of truth. */
  labels: Record<ResourceType, Map<string, string>>;
  /** Camera names, or null when Frigate is unreachable. */
  cameras: Map<string, string> | null;
}

const TUYA_TYPES: ResourceType[] = ["tuya_device", "tuya_sensor", "tuya_preset"];

/** Reads the database-backed resources plus Frigate's camera list. */
export async function loadCatalog(): Promise<Catalog> {
  const [devices, sensors, presets] = await Promise.all([
    db.select({ id: tuyaDevices.id, name: tuyaDevices.name }).from(tuyaDevices),
    db.select({ id: tuyaSensors.id, name: tuyaSensors.name }).from(tuyaSensors),
    db.select({ id: tuyaPresets.id, name: tuyaPresets.name }).from(tuyaPresets),
  ]);

  const labels: Record<ResourceType, Map<string, string>> = {
    tuya_device: new Map(devices.map((d) => [d.id, d.name])),
    tuya_sensor: new Map(sensors.map((s) => [s.id, s.name])),
    tuya_preset: new Map(presets.map((p) => [p.id, p.name])),
    cron_job: new Map(
      [...jobRegistry.entries()].map(([name, info]) => [name, info.label]),
    ),
    frigate_camera: new Map(),
  };

  let cameras: Map<string, string> | null = null;
  try {
    const res = await frigateFetch("/api/config");
    if (res.ok) {
      const config = (await res.json()) as {
        cameras?: Record<string, unknown>;
      };
      cameras = new Map(
        Object.keys(config.cameras ?? {}).map((name) => [name, name]),
      );
    }
  } catch {
    cameras = null;
  }

  return { labels, cameras };
}

function sourceFor(
  catalog: Catalog,
  type: ResourceType,
): Map<string, string> | null {
  return type === "frigate_camera" ? catalog.cameras : catalog.labels[type];
}

function usesFrigate(type: ResourceType): boolean {
  return type === "frigate_camera";
}

export async function listUsers(): Promise<UserRow[]> {
  return db
    .select({
      id: authUsers.id,
      uid: authUsers.uid,
      username: authUsers.username,
      createdAt: authUsers.createdAt,
      updatedAt: authUsers.updatedAt,
    })
    .from(authUsers)
    .orderBy(authUsers.username);
}

export async function getUser(id: string): Promise<UserRow | null> {
  const [user] = await db
    .select({
      id: authUsers.id,
      uid: authUsers.uid,
      username: authUsers.username,
      createdAt: authUsers.createdAt,
      updatedAt: authUsers.updatedAt,
    })
    .from(authUsers)
    .where(eq(authUsers.id, id))
    .limit(1);
  return user ?? null;
}

export async function managerUserIds(): Promise<string[]> {
  const rows = await db
    .select({ userId: authRouteGrants.userId })
    .from(authRouteGrants)
    .where(eq(authRouteGrants.routeKey, MANAGER_ROUTE_KEY));
  return rows.map((row) => row.userId);
}

async function isLastManager(userId: string): Promise<boolean> {
  const managers = await managerUserIds();
  return managers.length === 1 && managers[0] === userId;
}

export async function deleteUser(
  id: string,
): Promise<"ok" | "not_found" | "last_manager"> {
  const user = await getUser(id);
  if (!user) return "not_found";
  if (await isLastManager(id)) return "last_manager";
  await db.delete(authUsers).where(eq(authUsers.id, id));
  return "ok";
}

export interface RouteGrantRow {
  id: string;
  routeKey: string;
  createdAt: Date;
}

export interface ResourceGrantRow {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  action: ResourceAction;
  createdAt: Date;
}

export async function listRouteGrantRows(
  userId: string,
): Promise<RouteGrantRow[]> {
  return db
    .select({
      id: authRouteGrants.id,
      routeKey: authRouteGrants.routeKey,
      createdAt: authRouteGrants.createdAt,
    })
    .from(authRouteGrants)
    .where(eq(authRouteGrants.userId, userId))
    .orderBy(authRouteGrants.routeKey);
}

export async function listResourceGrantRows(
  userId: string,
): Promise<ResourceGrantRow[]> {
  return db
    .select({
      id: authResourceGrants.id,
      resourceType: authResourceGrants.resourceType,
      resourceId: authResourceGrants.resourceId,
      action: authResourceGrants.action,
      createdAt: authResourceGrants.createdAt,
    })
    .from(authResourceGrants)
    .where(eq(authResourceGrants.userId, userId))
    .orderBy(authResourceGrants.resourceType, authResourceGrants.resourceId);
}

function routeStatus(routeKey: string): "ok" | "orphaned" {
  if (isRegistryEmpty()) return "ok";
  return guardedRouteKeys().includes(routeKey) ? "ok" : "orphaned";
}

function resourceView(
  row: ResourceGrantRow,
  catalog: Catalog,
): ResourceGrantView {
  const source = sourceFor(catalog, row.resourceType);
  const label = source?.get(row.resourceId) ?? null;
  let status: GrantStatus;
  if (source === null) status = "unverified";
  else status = label === null ? "orphaned" : "ok";
  return {
    id: row.id,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    action: row.action,
    label,
    status,
  };
}

export async function listUserGrants(userId: string): Promise<{
  routes: RouteGrantView[];
  resources: ResourceGrantView[];
}> {
  const [routes, resources, catalog] = await Promise.all([
    listRouteGrantRows(userId),
    listResourceGrantRows(userId),
    loadCatalog(),
  ]);
  return {
    routes: routes.map((row) => ({
      id: row.id,
      routeKey: row.routeKey,
      status: routeStatus(row.routeKey),
    })),
    resources: resources.map((row) => resourceView(row, catalog)),
  };
}

export type RouteGrantResult =
  | { kind: "created"; grant: RouteGrantView }
  | { kind: "exists"; grant: RouteGrantView }
  | { kind: "user_not_found" }
  | { kind: "unknown_route" };

export async function createRouteGrant(
  userId: string,
  routeKey: string,
): Promise<RouteGrantResult> {
  const user = await getUser(userId);
  if (!user) return { kind: "user_not_found" };
  if (!isRegistryEmpty() && !guardedRouteKeys().includes(routeKey)) {
    return { kind: "unknown_route" };
  }

  const [existing] = await db
    .select({ id: authRouteGrants.id })
    .from(authRouteGrants)
    .where(
      and(
        eq(authRouteGrants.userId, userId),
        eq(authRouteGrants.routeKey, routeKey),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      kind: "exists",
      grant: { id: existing.id, routeKey, status: "ok" },
    };
  }

  const [created] = await db
    .insert(authRouteGrants)
    .values({ userId, routeKey })
    .onConflictDoNothing()
    .returning({ id: authRouteGrants.id });
  if (!created) {
    const [row] = await db
      .select({ id: authRouteGrants.id })
      .from(authRouteGrants)
      .where(
        and(
          eq(authRouteGrants.userId, userId),
          eq(authRouteGrants.routeKey, routeKey),
        ),
      )
      .limit(1);
    return {
      kind: "exists",
      grant: { id: row?.id ?? "", routeKey, status: "ok" },
    };
  }
  return {
    kind: "created",
    grant: { id: created.id, routeKey, status: "ok" },
  };
}

export async function deleteRouteGrant(
  grantId: string,
): Promise<"ok" | "not_found" | "last_manager"> {
  const [grant] = await db
    .select({
      id: authRouteGrants.id,
      userId: authRouteGrants.userId,
      routeKey: authRouteGrants.routeKey,
    })
    .from(authRouteGrants)
    .where(eq(authRouteGrants.id, grantId))
    .limit(1);
  if (!grant) return "not_found";
  if (grant.routeKey === MANAGER_ROUTE_KEY && (await isLastManager(grant.userId))) {
    return "last_manager";
  }
  await db.delete(authRouteGrants).where(eq(authRouteGrants.id, grantId));
  return "ok";
}

export type ResourceGrantResult =
  | { kind: "created"; grant: ResourceGrantView }
  | { kind: "exists"; grant: ResourceGrantView }
  | { kind: "user_not_found" }
  | { kind: "invalid_action" }
  | { kind: "unknown_resource" }
  | { kind: "frigate_unavailable" };

export async function createResourceGrant(
  userId: string,
  type: ResourceType,
  resourceId: string,
  action: ResourceAction,
): Promise<ResourceGrantResult> {
  const user = await getUser(userId);
  if (!user) return { kind: "user_not_found" };
  if (!VALID_ACTIONS[type].includes(action)) return { kind: "invalid_action" };

  const catalog = await loadCatalog();
  const source = sourceFor(catalog, type);
  if (source === null && usesFrigate(type)) return { kind: "frigate_unavailable" };
  if (source && !source.has(resourceId)) return { kind: "unknown_resource" };
  const label = source?.get(resourceId) ?? null;

  const [existing] = await db
    .select({ id: authResourceGrants.id })
    .from(authResourceGrants)
    .where(
      and(
        eq(authResourceGrants.userId, userId),
        eq(authResourceGrants.resourceType, type),
        eq(authResourceGrants.resourceId, resourceId),
        eq(authResourceGrants.action, action),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      kind: "exists",
      grant: {
        id: existing.id,
        resourceType: type,
        resourceId,
        action,
        label,
        status: source === null ? "unverified" : label === null ? "orphaned" : "ok",
      },
    };
  }

  const [created] = await db
    .insert(authResourceGrants)
    .values({ userId, resourceType: type, resourceId, action })
    .onConflictDoNothing()
    .returning({ id: authResourceGrants.id });
  if (!created) {
    const [row] = await db
      .select({ id: authResourceGrants.id })
      .from(authResourceGrants)
      .where(
        and(
          eq(authResourceGrants.userId, userId),
          eq(authResourceGrants.resourceType, type),
          eq(authResourceGrants.resourceId, resourceId),
          eq(authResourceGrants.action, action),
        ),
      )
      .limit(1);
    return {
      kind: "exists",
      grant: {
        id: row?.id ?? "",
        resourceType: type,
        resourceId,
        action,
        label,
        status: source === null ? "unverified" : label === null ? "orphaned" : "ok",
      },
    };
  }
  return {
    kind: "created",
    grant: {
      id: created.id,
      resourceType: type,
      resourceId,
      action,
      label,
      status: source === null ? "unverified" : label === null ? "orphaned" : "ok",
    },
  };
}

export async function deleteResourceGrant(
  grantId: string,
): Promise<"ok" | "not_found"> {
  const [grant] = await db
    .select({ id: authResourceGrants.id })
    .from(authResourceGrants)
    .where(eq(authResourceGrants.id, grantId))
    .limit(1);
  if (!grant) return "not_found";
  await db.delete(authResourceGrants).where(eq(authResourceGrants.id, grantId));
  return "ok";
}

export function listRoutes(): GuardedRoute[] {
  return guardedRoutes().sort((a, b) =>
    a.tag === b.tag ? a.path.localeCompare(b.path) : a.tag.localeCompare(b.tag),
  );
}

export async function listResources(): Promise<{
  resources: ResourceOption[];
  frigateAvailable: boolean;
}> {
  const catalog = await loadCatalog();
  const resources: ResourceOption[] = [];
  for (const type of TUYA_TYPES) {
    for (const [resourceId, label] of catalog.labels[type]) {
      resources.push({
        resourceType: type,
        resourceId,
        label,
        actions: VALID_ACTIONS[type],
      });
    }
  }
  for (const [resourceId, label] of catalog.labels.cron_job) {
    resources.push({
      resourceType: "cron_job",
      resourceId,
      label,
      actions: VALID_ACTIONS.cron_job,
    });
  }

  const frigateAvailable = catalog.cameras !== null;
  if (catalog.cameras) {
    for (const [resourceId, label] of catalog.cameras) {
      resources.push({
        resourceType: "frigate_camera",
        resourceId,
        label,
        actions: VALID_ACTIONS.frigate_camera,
      });
    }
  }

  return { resources, frigateAvailable };
}
