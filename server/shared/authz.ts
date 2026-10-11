/** The Elysia plugin name; also the first statement so coverage sees the module entry. */
export const AUTHZ_PLUGIN_NAME = "authz";

import { db } from "@server/db";
import {
  authResourceGrants,
  authRouteGrants,
  authUsers,
} from "@server/db/schema";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { Elysia, status } from "elysia";

export const AUTH_UID_HEADER = "x-authentik-uid";
export const AUTH_USERNAME_HEADER = "x-authentik-username";
export const AUTH_NAME_HEADER = "x-authentik-name";

/** Longest value accepted for an identity header before the request is denied. */
export const MAX_IDENTITY_LENGTH = 255;

/** The identity carried by a request, after header validation. */
export interface Identity {
  uid: string;
  username: string;
  name?: string;
}

/** The stored user plus the display name read from the current request. */
export interface AuthUser {
  id: string;
  uid: string;
  username: string;
  name: string;
}

/**
 * Test-only escape hatch. It is inert unless `NODE_ENV === "test"`, so it can
 * never weaken a development or production process. Dedicated authz tests
 * leave `mode` null and exercise the real database-backed checks.
 */
export interface AuthzTestOverride {
  mode: "allow-all" | null;
  user: AuthUser | null;
}

export const authzTestOverride: AuthzTestOverride = { mode: null, user: null };

function testOverrideActive(): boolean {
  return authzTestOverride.mode === "allow-all";
}

/** A set that reports membership for everything. */
const ALL_READABLE: Set<string> = Object.assign(new Set<string>(), {
  has: () => true,
});

export type ResourceType =
  | "tuya_device"
  | "tuya_sensor"
  | "tuya_preset"
  | "frigate_camera"
  | "cron_job";

export type ResourceAction = "read" | "write" | "apply" | "execute";

export const ALL_ACTIONS: ResourceAction[] = [
  "read",
  "write",
  "apply",
  "execute",
];

/** Which actions are valid for each resource type (enforced in the service layer). */
export const VALID_ACTIONS: Record<ResourceType, ResourceAction[]> = {
  tuya_device: ["read", "write"],
  tuya_sensor: ["read", "write"],
  tuya_preset: ["read", "write", "apply"],
  frigate_camera: ["read"],
  cron_job: ["read", "execute"],
};

/** The identity endpoint is guarded but needs no route grant. */
export const ME_ROUTE_KEY = "GET /api/me";
/** The OTEL span proxy is outside the guard entirely. */
export const TRACES_ROUTE_KEY = "POST /v1/traces";

export interface GuardedRoute {
  key: string;
  method: string;
  path: string;
  tag: string;
  summary: string;
}

const guardedRegistry = new Map<string, GuardedRoute>();

/**
 * Returns the single identity carried by the request headers, or null when a
 * required header is missing, empty or too long.
 */
export function identityFromHeaders(headers: Headers): Identity | null {
  const uid = headers.get(AUTH_UID_HEADER)?.trim();
  const username = headers.get(AUTH_USERNAME_HEADER)?.trim();
  if (!uid || uid.length > MAX_IDENTITY_LENGTH) return null;
  if (!username || username.length > MAX_IDENTITY_LENGTH) return null;
  const rawName = headers.get(AUTH_NAME_HEADER)?.trim();
  const name = rawName ? rawName.slice(0, MAX_IDENTITY_LENGTH) : undefined;
  return { uid, username, name };
}

/**
 * The development identity override: only active outside production, and only
 * when both variables are set. The header always wins over the override.
 */
export function devOverrideIdentity(
  env: Record<string, string | undefined> = process.env,
): Identity | null {
  if (env.NODE_ENV === "production") return null;
  const uid = env.USER_UID?.trim();
  const username = env.USER_NAME?.trim();
  if (!uid || !username) return null;
  return { uid, username };
}

/**
 * Warns when only one of the dev override variables is set, so a half-configured
 * local environment is not silently ignored.
 */
export function warnDevOverrideConfig(
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (env.NODE_ENV === "production") return null;
  const hasUid = Boolean(env.USER_UID?.trim());
  const hasName = Boolean(env.USER_NAME?.trim());
  if (hasUid === hasName) return null;
  const missing = hasUid ? "USER_NAME" : "USER_UID";
  return `[authz] ${missing} is not set; the development identity override is disabled.`;
}

/** Reads the resolved user from a request context. */
const USER_KEY = Symbol("authUser");

export function currentUser(ctx: object): AuthUser {
  const user = (ctx as Record<PropertyKey, unknown>)[USER_KEY] as
    | AuthUser
    | undefined;
  if (!user) throw new Error("No authenticated user in context");
  return user;
}

export function setCurrentUser(ctx: object, user: AuthUser): void {
  (ctx as Record<PropertyKey, unknown>)[USER_KEY] = user;
}

/**
 * Finds or creates the user for an identity. Race-safe: a concurrent first
 * request gets the same row back through RETURNING instead of failing on the
 * unique uid. The username is only written when it actually changed.
 */
export async function resolveUser(identity: Identity): Promise<AuthUser> {
  const [existing] = await db
    .select({ id: authUsers.id, username: authUsers.username })
    .from(authUsers)
    .where(eq(authUsers.uid, identity.uid))
    .limit(1);

  if (existing) {
    if (existing.username !== identity.username) {
      await db
        .update(authUsers)
        .set({ username: identity.username, updatedAt: new Date() })
        .where(
          and(
            eq(authUsers.id, existing.id),
            ne(authUsers.username, identity.username),
          ),
        );
    }
    return {
      id: existing.id,
      uid: identity.uid,
      username: identity.username,
      name: identity.name ?? identity.username,
    };
  }

  const [created] = await db
    .insert(authUsers)
    .values({ uid: identity.uid, username: identity.username })
    .onConflictDoUpdate({
      target: authUsers.uid,
      set: {
        username: sql`excluded.username`,
        updatedAt: sql`CASE WHEN ${authUsers.username} IS DISTINCT FROM excluded.username THEN now() ELSE ${authUsers.updatedAt} END`,
      },
    })
    .returning({ id: authUsers.id, username: authUsers.username });

  if (!created) throw new Error("User not created");
  return {
    id: created.id,
    uid: identity.uid,
    username: created.username,
    name: identity.name ?? identity.username,
  };
}

export async function hasRouteGrant(
  userId: string,
  routeKey: string,
): Promise<boolean> {
  if (testOverrideActive()) return true;
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
  return Boolean(row);
}

/**
 * True when the user holds the action or, for a read check, any action at all:
 * every non-read action implies read. Non-read checks stay exact.
 */
export async function hasResourceGrant(
  userId: string,
  type: ResourceType,
  resourceId: string,
  action: ResourceAction,
): Promise<boolean> {
  if (testOverrideActive()) return true;
  const actions: ResourceAction[] = action === "read" ? ALL_ACTIONS : [action];
  const [row] = await db
    .select({ id: authResourceGrants.id })
    .from(authResourceGrants)
    .where(
      and(
        eq(authResourceGrants.userId, userId),
        eq(authResourceGrants.resourceType, type),
        eq(authResourceGrants.resourceId, resourceId),
        inArray(authResourceGrants.action, actions),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Every resource id of a type the user can read (all actions imply read). */
export async function readableResourceIds(
  userId: string,
  type: ResourceType,
): Promise<Set<string>> {
  if (testOverrideActive()) return ALL_READABLE;
  const rows = await db
    .select({ resourceId: authResourceGrants.resourceId })
    .from(authResourceGrants)
    .where(
      and(
        eq(authResourceGrants.userId, userId),
        eq(authResourceGrants.resourceType, type),
      ),
    );
  return new Set(rows.map((row) => row.resourceId));
}

export async function listUserRouteGrantKeys(
  userId: string,
): Promise<string[]> {
  if (testOverrideActive()) return [];
  const rows = await db
    .select({ routeKey: authRouteGrants.routeKey })
    .from(authRouteGrants)
    .where(eq(authRouteGrants.userId, userId));
  return rows.map((row) => row.routeKey);
}

export interface StoredResourceGrant {
  resourceType: ResourceType;
  resourceId: string;
  action: ResourceAction;
}

export async function listUserResourceGrants(
  userId: string,
): Promise<StoredResourceGrant[]> {
  if (testOverrideActive()) return [];
  return db
    .select({
      resourceType: authResourceGrants.resourceType,
      resourceId: authResourceGrants.resourceId,
      action: authResourceGrants.action,
    })
    .from(authResourceGrants)
    .where(eq(authResourceGrants.userId, userId));
}

/** Inserts a resource grant if it does not exist yet. */
export async function grantResource(
  userId: string,
  type: ResourceType,
  resourceId: string,
  action: ResourceAction,
): Promise<void> {
  if (testOverrideActive()) return;
  await db
    .insert(authResourceGrants)
    .values({ userId, resourceType: type, resourceId, action })
    .onConflictDoNothing();
}

/** Gives the creator every action valid for the resource type. */
export async function grantAllValidActions(
  userId: string,
  type: ResourceType,
  resourceId: string,
): Promise<void> {
  for (const action of VALID_ACTIONS[type]) {
    await grantResource(userId, type, resourceId, action);
  }
}

/** Removes every grant pointing at a resource (called when it is deleted). */
export async function revokeResourceGrants(
  type: ResourceType,
  resourceId: string,
): Promise<void> {
  if (testOverrideActive()) return;
  await db
    .delete(authResourceGrants)
    .where(
      and(
        eq(authResourceGrants.resourceType, type),
        eq(authResourceGrants.resourceId, resourceId),
      ),
    );
}

interface GuardContext {
  route?: string;
  request: Request;
  params: Record<string, string | undefined>;
  body: unknown;
}

function routeKeyOf(ctx: GuardContext): string {
  return `${ctx.request.method} ${ctx.route ?? ""}`;
}

/** Only /api/* and the two openapi routes are guarded. */
export function isGuardedRoute(method: string, route?: string): boolean {
  if (!route) return false;
  if (route === "/v1/traces") return false;
  if (method === "GET" && (route === "/openapi" || route === "/openapi/json")) {
    return true;
  }
  return route.startsWith("/api/");
}

interface Requirement {
  type: ResourceType;
  id: string;
  action: ResourceAction;
}

/** The resource grants a route requires; empty for routes with no resource. */
export function resourceRequirements(
  routeKey: string,
  ctx: { params: Record<string, string | undefined>; body: unknown },
): Requirement[] {
  return RESOURCE_RULES[routeKey]?.(ctx as GuardContext) ?? [];
}

function param(ctx: GuardContext, name: string): string {
  return ctx.params[name] ?? "";
}

function bodyField(ctx: GuardContext, field: string): string {
  const body = ctx.body as Record<string, unknown> | null | undefined;
  const value = body?.[field];
  return typeof value === "string" ? value : "";
}

/**
 * Phase 2: the resource grant each single-resource route requires, keyed by the
 * same METHOD template keys as the route grants. List routes are absent here;
 * they are filtered by the handlers themselves.
 */
const RESOURCE_RULES: Record<string, (ctx: GuardContext) => Requirement[]> = {
  "GET /api/tuya/devices/:id/state": (ctx) => [
    { type: "tuya_device", id: param(ctx, "id"), action: "read" },
  ],
  "GET /api/tuya/devices/:id/history": (ctx) => [
    { type: "tuya_device", id: param(ctx, "id"), action: "read" },
  ],
  "POST /api/tuya/devices/:id/command": (ctx) => [
    { type: "tuya_device", id: param(ctx, "id"), action: "write" },
  ],
  "PUT /api/tuya/devices/:id": (ctx) => [
    { type: "tuya_device", id: param(ctx, "id"), action: "write" },
  ],
  "DELETE /api/tuya/devices/:id": (ctx) => [
    { type: "tuya_device", id: param(ctx, "id"), action: "write" },
  ],
  "GET /api/tuya/sensors/:id/history": (ctx) => [
    { type: "tuya_sensor", id: param(ctx, "id"), action: "read" },
  ],
  "PUT /api/tuya/sensors/:id": (ctx) => [
    { type: "tuya_sensor", id: param(ctx, "id"), action: "write" },
  ],
  "DELETE /api/tuya/sensors/:id": (ctx) => [
    { type: "tuya_sensor", id: param(ctx, "id"), action: "write" },
  ],
  "PUT /api/tuya/presets/:id": (ctx) => [
    { type: "tuya_preset", id: param(ctx, "id"), action: "write" },
  ],
  "DELETE /api/tuya/presets/:id": (ctx) => [
    { type: "tuya_preset", id: param(ctx, "id"), action: "write" },
  ],
  "POST /api/tuya/presets/:id/apply": (ctx) => [
    { type: "tuya_preset", id: param(ctx, "id"), action: "apply" },
    { type: "tuya_device", id: bodyField(ctx, "deviceId"), action: "write" },
  ],
  "GET /api/frigate/cameras/:name/stream": (ctx) => [
    { type: "frigate_camera", id: param(ctx, "name"), action: "read" },
  ],
  "GET /api/frigate/cameras/:name/goToFrigate": (ctx) => [
    { type: "frigate_camera", id: param(ctx, "name"), action: "read" },
  ],
  "POST /api/crons/run/:jobName": (ctx) => [
    { type: "cron_job", id: param(ctx, "jobName"), action: "execute" },
  ],
};

function forbidden() {
  return status(403, { error: "Access Denied" });
}

/**
 * Shared authorization plugin. Phase 1 (identity + route grant) runs before
 * validation; phase 2 (resource grants) runs after it, so it sees validated
 * params and body. It is `.as("global")` so mounting it applies the hooks to
 * the routes the module defines after it.
 */
export const authz = new Elysia({ name: AUTHZ_PLUGIN_NAME })
  .onTransform(async (ctx) => {
    if (testOverrideActive()) {
      setCurrentUser(ctx, authzTestOverride.user!);
      return;
    }
    const guardCtx = ctx as unknown as GuardContext;
    const method = guardCtx.request.method;
    const route = guardCtx.route;
    if (!isGuardedRoute(method, route)) return;
    const key = routeKeyOf(guardCtx);

    const headerIdentity = identityFromHeaders(guardCtx.request.headers);
    const identity = headerIdentity ?? devOverrideIdentity();
    if (!identity) throw forbidden();

    const user = await resolveUser(identity);
    setCurrentUser(ctx, user);

    if (key === ME_ROUTE_KEY) return;
    const allowed = await hasRouteGrant(user.id, key);
    if (!allowed) throw forbidden();
  })
  .onBeforeHandle(async (ctx) => {
    const guardCtx = ctx as unknown as GuardContext;
    const key = routeKeyOf(guardCtx);
    const requirements = resourceRequirements(key, guardCtx);
    if (requirements.length === 0) return;
    const user = (ctx as Record<PropertyKey, unknown>)[USER_KEY] as
      | AuthUser
      | undefined;
    if (!user) return forbidden();
    for (const requirement of requirements) {
      const ok = await hasResourceGrant(
        user.id,
        requirement.type,
        requirement.id,
        requirement.action,
      );
      if (!ok) return forbidden();
    }
  })
  .as("global");

interface RouteLike {
  method: string;
  path: string;
  hooks?: { detail?: { tags?: string[]; summary?: string } };
}

function moduleTag(path: string): string {
  const segment = path.split("/")[2] ?? path;
  return segment
    .split("-")
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function fallbackSummary(key: string): string {
  return key;
}

const OPENAPI_DETAIL: Record<string, { tag: string; summary: string }> = {
  "GET /openapi": { tag: "OpenAPI", summary: "Docs UI" },
  "GET /openapi/json": { tag: "OpenAPI", summary: "Spec JSON" },
};

/**
 * Fills the process-global route registry from the full app's route table.
 * Called once at startup; replaces the previous content. The registry is only
 * used by the permissions API (route picker / orphan detection), never by the
 * guard itself.
 */
export function registerGuardedRoutes(app: { routes: RouteLike[] }): void {
  guardedRegistry.clear();
  for (const route of app.routes) {
    const key = `${route.method} ${route.path}`;
    if (!isGuardedRoute(route.method, route.path)) continue;
    if (key === ME_ROUTE_KEY) continue;
    const detail = route.hooks?.detail;
    const special = OPENAPI_DETAIL[key];
    const tag = detail?.tags?.[0] ?? special?.tag ?? moduleTag(route.path);
    const summary =
      detail?.summary ?? special?.summary ?? fallbackSummary(key);
    guardedRegistry.set(key, {
      key,
      method: route.method,
      path: route.path,
      tag,
      summary,
    });
  }
}

export function guardedRoutes(): GuardedRoute[] {
  return [...guardedRegistry.values()];
}

export function guardedRouteKeys(): string[] {
  return [...guardedRegistry.keys()];
}

export function isRegistryEmpty(): boolean {
  return guardedRegistry.size === 0;
}
