import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { Elysia, t } from "elysia";

import {
  fakeDbResults,
  installFakeDb,
  resetFakeDb,
} from "../../helpers/tuya-db";

const restoreDb = await installFakeDb();
const authz = await import("@server/shared/authz");
afterAll(() => restoreDb());

beforeEach(() => {
  resetFakeDb();
  authz.authzTestOverride.mode = null;
  authz.authzTestOverride.user = null;
});

describe("identity headers", () => {
  test("requires uid and username, trims and truncates the name", () => {
    expect(authz.identityFromHeaders(new Headers())).toBeNull();
    expect(
      authz.identityFromHeaders(new Headers({ "x-authentik-uid": "  " })),
    ).toBeNull();
    expect(
      authz.identityFromHeaders(
        new Headers({ "x-authentik-uid": "u", "x-authentik-username": "  " }),
      ),
    ).toBeNull();
    const long = "a".repeat(300);
    expect(
      authz.identityFromHeaders(
        new Headers({ "x-authentik-uid": long, "x-authentik-username": "b" }),
      ),
    ).toBeNull();
    expect(
      authz.identityFromHeaders(
        new Headers({ "x-authentik-uid": "u", "x-authentik-username": long }),
      ),
    ).toBeNull();
    const identity = authz.identityFromHeaders(
      new Headers({
        "x-authentik-uid": " u ",
        "x-authentik-username": " alice ",
        "x-authentik-name": "n".repeat(300),
      }),
    );
    expect(identity).toEqual({
      uid: "u",
      username: "alice",
      name: "n".repeat(255),
    });
    expect(
      authz.identityFromHeaders(
        new Headers({ "x-authentik-uid": "u", "x-authentik-username": "a" }),
      ),
    ).toEqual({ uid: "u", username: "a", name: undefined });
  });

  test("dev override needs both variables and is off in production", () => {
    expect(
      authz.devOverrideIdentity({ NODE_ENV: "production", USER_UID: "u", USER_NAME: "a" }),
    ).toBeNull();
    // Only an explicit development or test environment enables the override.
    for (const NODE_ENV of [undefined, "", "staging", "prod"]) {
      expect(authz.devOverrideIdentity({ NODE_ENV, USER_UID: "u", USER_NAME: "a" })).toBeNull();
    }
    const dev = { NODE_ENV: "development" };
    expect(authz.devOverrideIdentity({ ...dev, USER_UID: "u" })).toBeNull();
    expect(authz.devOverrideIdentity({ ...dev, USER_NAME: "a" })).toBeNull();
    expect(authz.devOverrideIdentity({ ...dev, USER_UID: " u ", USER_NAME: " a " })).toEqual({
      uid: "u",
      username: "a",
    });
    expect(authz.devOverrideIdentity({ NODE_ENV: "test", USER_UID: "u", USER_NAME: "a" })).toEqual({
      uid: "u",
      username: "a",
    });
  });

  test("warnDevOverrideConfig names the missing variable", () => {
    expect(authz.warnDevOverrideConfig({ NODE_ENV: "production", USER_UID: "u" })).toBeNull();
    expect(authz.warnDevOverrideConfig({ USER_UID: "u" })).toBeNull();
    const dev = { NODE_ENV: "development" };
    expect(authz.warnDevOverrideConfig({ ...dev, USER_UID: "u", USER_NAME: "a" })).toBeNull();
    expect(authz.warnDevOverrideConfig(dev)).toBeNull();
    expect(authz.warnDevOverrideConfig({ ...dev, USER_UID: "u" })).toContain("USER_NAME");
    expect(authz.warnDevOverrideConfig({ ...dev, USER_NAME: "a" })).toContain("USER_UID");
  });

  test("isGuardedRoute covers api, openapi and excludes traces", () => {
    expect(authz.isGuardedRoute("GET", "/api/x")).toBe(true);
    expect(authz.isGuardedRoute("GET", "/openapi")).toBe(true);
    expect(authz.isGuardedRoute("GET", "/openapi/json")).toBe(true);
    expect(authz.isGuardedRoute("POST", "/openapi")).toBe(false);
    expect(authz.isGuardedRoute("POST", "/v1/traces")).toBe(false);
    expect(authz.isGuardedRoute("GET", "/favicon.ico")).toBe(false);
    expect(authz.isGuardedRoute("GET", undefined)).toBe(false);
  });
});

describe("user lifecycle", () => {
  test("existing user with the same username needs no write", async () => {
    fakeDbResults.push([{ id: "u1", username: "alice" }]);
    const resolved = await authz.resolveUser({ uid: "uid-1", username: "alice" });
    expect(resolved).toEqual({
      id: "u1",
      uid: "uid-1",
      username: "alice",
      name: "alice",
    });
    expect(fakeDbResults).toHaveLength(0);
  });

  test("existing user with a new username updates it", async () => {
    fakeDbResults.push([{ id: "u1", username: "old" }], []);
    const resolved = await authz.resolveUser({ uid: "uid-1", username: "new" });
    expect(resolved.username).toBe("new");
  });

  test("first request inserts and keeps the display name", async () => {
    fakeDbResults.push([], [{ id: "u2", username: "bob" }]);
    const resolved = await authz.resolveUser({ uid: "uid-2", username: "bob", name: "Bob B" });
    expect(resolved).toEqual({ id: "u2", uid: "uid-2", username: "bob", name: "Bob B" });
  });

  test("a failed insert throws", async () => {
    fakeDbResults.push([], []);
    await expect(
      authz.resolveUser({ uid: "uid-3", username: "x" }),
    ).rejects.toThrow("User not created");
  });
});

describe("grants", () => {
  test("route grant found or not", async () => {
    fakeDbResults.push([{ id: "g1" }]);
    expect(await authz.hasRouteGrant("u1", "GET /api/x")).toBe(true);
    fakeDbResults.push([]);
    expect(await authz.hasRouteGrant("u1", "GET /api/x")).toBe(false);
  });

  test("read is implied by any action, other actions stay exact", async () => {
    fakeDbResults.push([{ id: "g1" }]);
    expect(await authz.hasResourceGrant("u1", "tuya_device", "d1", "read")).toBe(true);
    fakeDbResults.push([]);
    expect(await authz.hasResourceGrant("u1", "tuya_device", "d1", "write")).toBe(false);
  });

  test("readableResourceIds and grant listings", async () => {
    fakeDbResults.push([{ resourceId: "d1" }, { resourceId: "d2" }]);
    const ids = await authz.readableResourceIds("u1", "tuya_device");
    expect([...ids]).toEqual(["d1", "d2"]);
    fakeDbResults.push([{ routeKey: "GET /api/x" }]);
    expect(await authz.listUserRouteGrantKeys("u1")).toEqual(["GET /api/x"]);
    fakeDbResults.push([
      { resourceType: "tuya_device", resourceId: "d1", action: "read" },
    ]);
    expect(await authz.listUserResourceGrants("u1")).toHaveLength(1);
  });

  test("grant, grantAll and revoke call the database", async () => {
    fakeDbResults.push([], []);
    await authz.grantResource("u1", "tuya_device", "d1", "read");
    fakeDbResults.push([], [], [], []);
    await authz.grantAllValidActions("u1", "tuya_device", "d1");
    fakeDbResults.push([]);
    await authz.revokeResourceGrants("tuya_device", "d1");
  });

  test("currentUser throws when absent", () => {
    const ctx = {};
    expect(() => authz.currentUser(ctx)).toThrow("No authenticated user");
    authz.setCurrentUser(ctx, {
      id: "u1",
      uid: "uid",
      username: "a",
      name: "A",
    });
    expect(authz.currentUser(ctx).id).toBe("u1");
  });
});

describe("route registry", () => {
  test("registerGuardedRoutes extracts detail and applies fallbacks", () => {
    authz.registerGuardedRoutes({
      routes: [
        { method: "GET", path: "/api/train-status/lines", hooks: { detail: { tags: ["Train"], summary: "Lines" } } },
        { method: "GET", path: "/api/no-meta/:id" },
        { method: "GET", path: "/openapi" },
        { method: "GET", path: "/openapi/json" },
        { method: "GET", path: "/api/me" },
        { method: "POST", path: "/v1/traces" },
        { method: "GET", path: "/favicon.ico" },
      ],
    });
    const keys = authz.guardedRouteKeys();
    expect(keys).toContain("GET /api/train-status/lines");
    expect(keys).not.toContain("GET /api/me");
    expect(keys).not.toContain("POST /v1/traces");
    expect(authz.isRegistryEmpty()).toBe(false);
    const noMeta = authz.guardedRoutes().find((r) => r.path === "/api/no-meta/:id");
    expect(noMeta).toMatchObject({ tag: "No Meta", summary: "GET /api/no-meta/:id" });
    expect(authz.guardedRoutes().find((r) => r.path === "/openapi")?.tag).toBe("OpenAPI");
    // replaces content rather than appending
    authz.registerGuardedRoutes({ routes: [] });
    expect(authz.isRegistryEmpty()).toBe(true);
  });
});

describe("guard integration", () => {
  function buildApp() {
    return new Elysia()
      .use(
        new Elysia({ prefix: "/api/tuya" })
          .use(authz.authz)
          .get("/devices", () => ({ ok: true }))
          .get("/devices/:id/state", () => ({ ok: true }))
          .post("/devices", () => ({ ok: true }), {
            body: t.Object({ name: t.String() }),
          }),
      )
      .use(
        new Elysia()
          .use(authz.authz)
          .get("/api/me", () => ({ ok: true }))
          .post("/v1/traces", () => ({ ok: true })),
      );
  }
  const app = buildApp();
  const headers = {
    "x-authentik-uid": "uid-1",
    "x-authentik-username": "alice",
  };

  test("no identity is a 403", async () => {
    const res = await app.handle(new Request("http://localhost/api/tuya/devices"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Access Denied" });
  });

  test("valid identity without a route grant is a 403", async () => {
    fakeDbResults.push([{ id: "u1", username: "alice" }], []);
    const res = await app.handle(
      new Request("http://localhost/api/tuya/devices", { headers }),
    );
    expect(res.status).toBe(403);
  });

  test("route grant without the resource grant is a 403", async () => {
    fakeDbResults.push([{ id: "u1", username: "alice" }], [{ id: "r" }], []);
    const res = await app.handle(
      new Request("http://localhost/api/tuya/devices/d1/state", { headers }),
    );
    expect(res.status).toBe(403);
  });

  test("route and resource grants allow the request", async () => {
    fakeDbResults.push([{ id: "u1", username: "alice" }], [{ id: "r" }], [{ id: "g" }]);
    const res = await app.handle(
      new Request("http://localhost/api/tuya/devices/d1/state", { headers }),
    );
    expect(res.status).toBe(200);
  });

  test("malformed body: 403 without the route grant, 422 with it", async () => {
    fakeDbResults.push([{ id: "u1", username: "alice" }], []);
    const denied = await app.handle(
      new Request("http://localhost/api/tuya/devices", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(denied.status).toBe(403);

    fakeDbResults.push([{ id: "u1", username: "alice" }], [{ id: "r" }]);
    const invalid = await app.handle(
      new Request("http://localhost/api/tuya/devices", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(invalid.status).toBe(422);
  });

  test("/api/me needs an identity but no route grant", async () => {
    fakeDbResults.push([{ id: "u1", username: "alice" }]);
    const res = await app.handle(new Request("http://localhost/api/me", { headers }));
    expect(res.status).toBe(200);
  });

  test("POST /v1/traces is outside the guard", async () => {
    const res = await app.handle(
      new Request("http://localhost/v1/traces", { method: "POST" }),
    );
    expect(res.status).toBe(200);
  });

  test("unmatched api paths keep the 404", async () => {
    const res = await app.handle(new Request("http://localhost/api/tuya/nope"));
    expect(res.status).toBe(404);
  });

  test("dev override supplies the identity when the header is absent", async () => {
    const previous = {
      NODE_ENV: process.env.NODE_ENV,
      USER_UID: process.env.USER_UID,
      USER_NAME: process.env.USER_NAME,
    };
    process.env.NODE_ENV = "development";
    process.env.USER_UID = "uid-dev";
    process.env.USER_NAME = "dev";
    try {
      fakeDbResults.push([{ id: "u1", username: "dev" }], [{ id: "r" }]);
      const res = await app.handle(new Request("http://localhost/api/tuya/devices"));
      expect(res.status).toBe(200);
    } finally {
      for (const [k, v] of Object.entries(previous)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  test("the allow-all override identifies every request", async () => {
    authz.authzTestOverride.mode = "allow-all";
    authz.authzTestOverride.user = authz.authzTestOverride.user ?? {
      id: "test",
      uid: "test",
      username: "test",
      name: "Test",
    };
    const res = await app.handle(new Request("http://localhost/api/tuya/devices"));
    expect(res.status).toBe(200);
    fakeDbResults.push([{ id: "d1" }]);
    expect(await authz.readableResourceIds("test", "tuya_device")).toEqual(
      expect.any(Object),
    );
    expect(await authz.hasRouteGrant("x", "y")).toBe(true);
    expect(await authz.hasResourceGrant("test", "tuya_device", "d", "read")).toBe(true);
    fakeDbResults.push([]);
    expect(await authz.listUserRouteGrantKeys("test")).toEqual([]);
    fakeDbResults.push([]);
    expect(await authz.listUserResourceGrants("test")).toEqual([]);
    await authz.grantResource("test", "tuya_device", "d", "read");
    await authz.grantAllValidActions("test", "tuya_device", "d");
    await authz.revokeResourceGrants("tuya_device", "d");
  });

  test("allow-all readable set reports membership for everything", async () => {
    authz.authzTestOverride.mode = "allow-all";
    fakeDbResults.push([]);
    const ids = await authz.readableResourceIds("anyone", "tuya_device");
    expect(ids.has("anything")).toBe(true);
  });
});

describe("resource requirements", () => {
  const ctx = {
    params: { id: "d1", name: "cam", jobName: "job" },
    body: { deviceId: "dev" },
  };
  test("maps every single-resource route to its grant", () => {
    const cases: [string, unknown][] = [
      ["GET /api/tuya/devices/:id/state", { type: "tuya_device", id: "d1", action: "read" }],
      ["GET /api/tuya/devices/:id/history", { type: "tuya_device", id: "d1", action: "read" }],
      ["POST /api/tuya/devices/:id/command", { type: "tuya_device", id: "d1", action: "write" }],
      ["PUT /api/tuya/devices/:id", { type: "tuya_device", id: "d1", action: "write" }],
      ["DELETE /api/tuya/devices/:id", { type: "tuya_device", id: "d1", action: "write" }],
      ["GET /api/tuya/sensors/:id/history", { type: "tuya_sensor", id: "d1", action: "read" }],
      ["PUT /api/tuya/sensors/:id", { type: "tuya_sensor", id: "d1", action: "write" }],
      ["DELETE /api/tuya/sensors/:id", { type: "tuya_sensor", id: "d1", action: "write" }],
      ["PUT /api/tuya/presets/:id", { type: "tuya_preset", id: "d1", action: "write" }],
      ["DELETE /api/tuya/presets/:id", { type: "tuya_preset", id: "d1", action: "write" }],
      ["GET /api/frigate/cameras/:name/stream", { type: "frigate_camera", id: "cam", action: "read" }],
      ["GET /api/frigate/cameras/:name/goToFrigate", { type: "frigate_camera", id: "cam", action: "read" }],
      ["POST /api/crons/run/:jobName", { type: "cron_job", id: "job", action: "execute" }],
    ];
    for (const [key, expected] of cases) {
      expect(authz.resourceRequirements(key, ctx)).toEqual([expected] as never);
    }
    expect(
      authz.resourceRequirements("POST /api/tuya/presets/:id/apply", ctx),
    ).toEqual([
      { type: "tuya_preset", id: "d1", action: "apply" },
      { type: "tuya_device", id: "dev", action: "write" },
    ]);
    expect(authz.resourceRequirements("GET /api/tuya/devices", ctx)).toEqual([]);
  });

  test("missing params and non-string body fields fall back to empty strings", () => {
    const requirements = authz.resourceRequirements(
      "POST /api/tuya/presets/:id/apply",
      { params: {}, body: undefined },
    );
    expect(requirements[0]!.id).toBe("");
    expect(requirements[1]!.id).toBe("");
  });
});
