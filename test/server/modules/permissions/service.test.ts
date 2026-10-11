import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

import {
  fakeDbResults,
  installFakeDb,
  resetFakeDb,
} from "../../../helpers/tuya-db";

process.env.FRIGATE_CLIENT_ID = "cid";
process.env.FRIGATE_ENDPOINT = "http://frigate.local/";

const restoreDb = await installFakeDb();
const realAuth = { ...(await import("@server/shared/authentik")) };
mock.module("@server/shared/authentik", () => ({
  ...realAuth,
  loginInAuthentik: async () => ({ access_token: "T" }),
}));
const service = await import("@server/modules/permissions/service");
const authz = await import("@server/shared/authz");
const { MANAGER_ROUTE_KEY } = await import(
  "@server/modules/permissions/constants"
);
afterAll(() => {
  restoreDb();
  mock.module("@server/shared/authentik", () => realAuth);
});

const user = {
  id: "u1",
  uid: "uid-1",
  username: "alice",
  createdAt: new Date(),
  updatedAt: new Date(),
};

let fetchSpy: ReturnType<typeof spyOn> | undefined;
function mockFrigate(response: Response | Error) {
  fetchSpy?.mockRestore();
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation((() =>
    response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response)) as never);
}
function queueCatalog(
  devices: { id: string; name: string; kind?: string }[] = [],
  sensors: { id: string; name: string; kind?: string }[] = [],
  presets: { id: string; name: string }[] = [],
) {
  fakeDbResults.push(devices, sensors, presets);
}

beforeEach(() => {
  resetFakeDb();
  authz.registerGuardedRoutes({ routes: [] });
  mockFrigate(new Response(JSON.stringify({ cameras: {} }), { status: 200 }));
});

describe("catalog", () => {
  test("reads tuya tables, crons and frigate cameras", async () => {
    queueCatalog([{ id: "d1", name: "Lamp" }], [{ id: "s1", name: "Door" }], [{ id: "p1", name: "Read" }]);
    mockFrigate(
      new Response(JSON.stringify({ cameras: { cam1: {}, off: { enabled: false } } }), { status: 200 }),
    );
    const catalog = await service.loadCatalog();
    expect(catalog.labels.tuya_device.get("d1")).toBe("Lamp");
    expect(catalog.labels.tuya_sensor.get("s1")).toBe("Door");
    expect(catalog.labels.tuya_preset.get("p1")).toBe("Read");
    expect(catalog.cameras?.has("off")).toBe(true);
    expect(catalog.labels.cron_job.size).toBeGreaterThan(0);
  });

  test("frigate failure leaves cameras unavailable", async () => {
    queueCatalog();
    mockFrigate(new Response("x", { status: 500 }));
    expect((await service.loadCatalog()).cameras).toBeNull();
    queueCatalog();
    mockFrigate(new Error("network"));
    expect((await service.loadCatalog()).cameras).toBeNull();
  });
});

describe("users and managers", () => {
  test("listUsers and getUser", async () => {
    fakeDbResults.push([user]);
    expect(await service.listUsers()).toHaveLength(1);
    fakeDbResults.push([user]);
    expect((await service.getUser("u1"))?.username).toBe("alice");
    fakeDbResults.push([]);
    expect(await service.getUser("nope")).toBeNull();
  });

  test("deleteUser: not found, last manager, ok", async () => {
    fakeDbResults.push([]);
    expect(await service.deleteUser("x")).toBe("not_found");

    fakeDbResults.push([user]); // getUser
    fakeDbResults.push([{ userId: "u1" }]); // managers
    expect(await service.deleteUser("u1")).toBe("last_manager");

    fakeDbResults.push([user]); // getUser
    fakeDbResults.push([{ userId: "u1" }, { userId: "u2" }]); // managers
    fakeDbResults.push([]); // delete
    expect(await service.deleteUser("u1")).toBe("ok");
  });

  test("managerUserIds maps rows", async () => {
    fakeDbResults.push([{ userId: "a" }, { userId: "b" }]);
    expect(await service.managerUserIds()).toEqual(["a", "b"]);
  });
});

describe("grants listing", () => {
  test("route status is ok while the registry is empty", async () => {
    fakeDbResults.push([{ id: "g1", routeKey: "GET /api/x", createdAt: new Date() }]);
    fakeDbResults.push([]); // resources
    queueCatalog();
    const grants = await service.listUserGrants("u1");
    expect(grants.routes[0]).toEqual({ id: "g1", routeKey: "GET /api/x", status: "ok" });
  });

  test("orphaned and unverified resources", async () => {
    authz.registerGuardedRoutes({
      routes: [
        { method: "GET", path: "/api/x", hooks: { detail: { tags: ["X"], summary: "X" } } },
      ],
    });
    fakeDbResults.push([
      { id: "g1", routeKey: "GET /api/gone", createdAt: new Date() },
      { id: "g2", routeKey: "GET /api/x", createdAt: new Date() },
    ]);
    fakeDbResults.push([
      { id: "r1", resourceType: "tuya_device", resourceId: "d1", action: "read", createdAt: new Date() },
      { id: "r2", resourceType: "tuya_device", resourceId: "missing", action: "read", createdAt: new Date() },
      { id: "r3", resourceType: "frigate_camera", resourceId: "cam1", action: "read", createdAt: new Date() },
      { id: "r4", resourceType: "frigate_camera", resourceId: "cam2", action: "read", createdAt: new Date() },
      { id: "r5", resourceType: "cron_job", resourceId: "tuya.history.prune", action: "read", createdAt: new Date() },
    ]);
    queueCatalog([{ id: "d1", name: "Lamp" }]);
    mockFrigate(new Response(JSON.stringify({ cameras: { cam1: {} } }), { status: 200 }));
    const grants = await service.listUserGrants("u1");
    expect(grants.routes.map((g) => g.status)).toEqual(["orphaned", "ok"]);
    expect(grants.resources.map((g) => g.status)).toEqual([
      "ok",
      "orphaned",
      "ok",
      "orphaned",
      "ok",
    ]);
    expect(grants.resources[0]!.label).toBe("Lamp");
  });

  test("camera grants are unverified when frigate is down", async () => {
    fakeDbResults.push([]); // routes
    fakeDbResults.push([
      { id: "r1", resourceType: "frigate_camera", resourceId: "cam1", action: "read", createdAt: new Date() },
    ]);
    queueCatalog();
    mockFrigate(new Error("down"));
    const grants = await service.listUserGrants("u1");
    expect(grants.resources[0]).toMatchObject({ status: "unverified", label: null });
  });
});

describe("grant creation and deletion", () => {
  test("createRouteGrant: user not found", async () => {
    fakeDbResults.push([]);
    expect(await service.createRouteGrant("x", "GET /api/x")).toEqual({ kind: "user_not_found" });
  });

  test("createRouteGrant: unknown route when the registry has entries", async () => {
    authz.registerGuardedRoutes({
      routes: [
        { method: "GET", path: "/api/x", hooks: { detail: { tags: ["X"], summary: "X" } } },
      ],
    });
    fakeDbResults.push([user]);
    expect(await service.createRouteGrant("u1", "GET /api/nope")).toEqual({ kind: "unknown_route" });
  });

  test("createRouteGrant: exists, created and concurrent retry", async () => {
    fakeDbResults.push([user], [{ id: "g1" }]);
    expect(await service.createRouteGrant("u1", "GET /api/x")).toEqual({
      kind: "exists",
      grant: { id: "g1", routeKey: "GET /api/x", status: "ok" },
    });

    fakeDbResults.push([user], [], [{ id: "g2" }]);
    expect(await service.createRouteGrant("u1", "GET /api/x")).toEqual({
      kind: "created",
      grant: { id: "g2", routeKey: "GET /api/x", status: "ok" },
    });

    fakeDbResults.push([user], [], [], [{ id: "g3" }]);
    expect(await service.createRouteGrant("u1", "GET /api/x")).toEqual({
      kind: "exists",
      grant: { id: "g3", routeKey: "GET /api/x", status: "ok" },
    });
  });

  test("deleteRouteGrant: not found, last manager, ok", async () => {
    fakeDbResults.push([]);
    expect(await service.deleteRouteGrant("g")).toBe("not_found");

    fakeDbResults.push([{ id: "g", userId: "u1", routeKey: MANAGER_ROUTE_KEY }]);
    fakeDbResults.push([{ userId: "u1" }]);
    expect(await service.deleteRouteGrant("g")).toBe("last_manager");

    fakeDbResults.push([{ id: "g", userId: "u1", routeKey: "GET /api/x" }]);
    fakeDbResults.push([]);
    expect(await service.deleteRouteGrant("g")).toBe("ok");
  });

  test("createResourceGrant: user, action, frigate and unknown checks", async () => {
    fakeDbResults.push([]);
    expect(await service.createResourceGrant("x", "tuya_device", "d", "read")).toEqual({
      kind: "user_not_found",
    });

    fakeDbResults.push([user]);
    expect(await service.createResourceGrant("u1", "frigate_camera", "cam", "write")).toEqual({
      kind: "invalid_action",
    });

    fakeDbResults.push([user]);
    queueCatalog();
    mockFrigate(new Error("down"));
    expect(await service.createResourceGrant("u1", "frigate_camera", "cam", "read")).toEqual({
      kind: "frigate_unavailable",
    });

    fakeDbResults.push([user]);
    queueCatalog([{ id: "d1", name: "L" }]);
    expect(await service.createResourceGrant("u1", "tuya_device", "missing", "read")).toEqual({
      kind: "unknown_resource",
    });
  });

  test("createResourceGrant: exists, created, concurrent", async () => {
    fakeDbResults.push([user]);
    queueCatalog([{ id: "d1", name: "L" }]);
    fakeDbResults.push([{ id: "r1" }]);
    expect(await service.createResourceGrant("u1", "tuya_device", "d1", "read")).toEqual({
      kind: "exists",
      grant: { id: "r1", resourceType: "tuya_device", resourceId: "d1", action: "read", label: "L", status: "ok" },
    });

    fakeDbResults.push([user]);
    queueCatalog([{ id: "d1", name: "L" }]);
    fakeDbResults.push([], [{ id: "r2" }]);
    expect((await service.createResourceGrant("u1", "tuya_device", "d1", "read")).kind).toBe("created");

    fakeDbResults.push([user]);
    queueCatalog([{ id: "d1", name: "L" }]);
    fakeDbResults.push([], [], [{ id: "r3" }]);
    expect((await service.createResourceGrant("u1", "tuya_device", "d1", "read"))).toMatchObject({
      kind: "exists",
      grant: { id: "r3" },
    });
  });

  test("camera create reports unverified when frigate is down", async () => {
    fakeDbResults.push([user]);
    queueCatalog();
    mockFrigate(new Error("down"));
    // frigate down means the source is null, so it short-circuits before the DB check
    expect(await service.createResourceGrant("u1", "frigate_camera", "cam", "read")).toEqual({
      kind: "frigate_unavailable",
    });
  });

  test("deleteResourceGrant: not found and ok", async () => {
    fakeDbResults.push([]);
    expect(await service.deleteResourceGrant("r")).toBe("not_found");
    fakeDbResults.push([{ id: "r" }], []);
    expect(await service.deleteResourceGrant("r")).toBe("ok");
  });
});

describe("pickers", () => {
  test("listRoutes is sorted by tag then path", () => {
    authz.registerGuardedRoutes({
      routes: [
        { method: "GET", path: "/api/b", hooks: { detail: { tags: ["B"], summary: "B" } } },
        { method: "GET", path: "/api/a2", hooks: { detail: { tags: ["A"], summary: "A2" } } },
        { method: "GET", path: "/api/a1", hooks: { detail: { tags: ["A"], summary: "A1" } } },
      ],
    });
    expect(service.listRoutes().map((r) => r.key)).toEqual([
      "GET /api/a1",
      "GET /api/a2",
      "GET /api/b",
    ]);
  });

  test("listResources gathers tuya, cron and cameras", async () => {
    queueCatalog(
      [{ id: "d1", name: "L", kind: "lamp" }],
      [{ id: "s1", name: "S", kind: "door" }, { id: "s2", name: "Old" }],
      [{ id: "p1", name: "P" }],
    );
    mockFrigate(new Response(JSON.stringify({ cameras: { cam1: {} } }), { status: 200 }));
    const result = await service.listResources();
    expect(result.frigateAvailable).toBe(true);
    const kindOf = (id: string) => result.resources.find((r) => r.resourceId === id)?.kind;
    expect(kindOf("d1")).toBe("lamp");
    expect(kindOf("s1")).toBe("door");
    expect(kindOf("s2")).toBeUndefined();
    expect(kindOf("p1")).toBeUndefined();
    expect(result.resources.map((r) => r.resourceType)).toEqual(
      expect.arrayContaining(["tuya_device", "tuya_sensor", "tuya_preset", "cron_job", "frigate_camera"]),
    );

    queueCatalog();
    mockFrigate(new Error("down"));
    const offline = await service.listResources();
    expect(offline.frigateAvailable).toBe(false);
    expect(offline.resources.some((r) => r.resourceType === "frigate_camera")).toBe(false);
  });
});

describe("startup checks", () => {
  test("warns when the manager route key is not registered", async () => {
    authz.registerGuardedRoutes({ routes: [] });
    await expect(service.runAuthzStartupChecks()).resolves.toBeUndefined();
  });

  test("warns when no manager exists and is silent when there is one", async () => {
    authz.registerGuardedRoutes({
      routes: [
        {
          method: "POST",
          path: "/api/permissions/users/:id/route-grants",
          hooks: { detail: { tags: ["Permissions"], summary: "Grant" } },
        },
      ],
    });
    fakeDbResults.push([]);
    await service.runAuthzStartupChecks();
    fakeDbResults.push([{ userId: "u1" }]);
    await service.runAuthzStartupChecks();
  });

  test("survives a database error", async () => {
    authz.registerGuardedRoutes({
      routes: [
        {
          method: "POST",
          path: "/api/permissions/users/:id/route-grants",
          hooks: { detail: { tags: ["Permissions"], summary: "Grant" } },
        },
      ],
    });
    fakeDbResults.push(new Error("db down"));
    await service.runAuthzStartupChecks();
  });
});
