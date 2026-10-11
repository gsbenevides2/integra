import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

import { installTestAuthz, TEST_USER } from "../../../helpers/auth";

const restoreAuthz = installTestAuthz();

const realService = { ...(await import("@server/modules/permissions/service")) };
const service = {
  listUsers: mock(async () => []),
  getUser: mock(async () => null),
  listUserGrants: mock(async () => ({ routes: [], resources: [] })),
  deleteUser: mock(async () => "ok"),
  createRouteGrant: mock(async () => ({ kind: "created", grant: { id: "g", routeKey: "k", status: "ok" } })),
  deleteRouteGrant: mock(async () => "ok"),
  createResourceGrant: mock(async () => ({ kind: "created", grant: { id: "r" } })),
  deleteResourceGrant: mock(async () => "ok"),
  listRoutes: mock(() => []),
  listResources: mock(async () => ({ resources: [], frigateAvailable: true })),
  runAuthzStartupChecks: mock(async () => {}),
};
mock.module("@server/modules/permissions/service", () => service);

const { permissionsRoutes, meRoutes } = await import(
  "@server/modules/permissions/index"
);
afterAll(() => {
  restoreAuthz();
  mock.module("@server/modules/permissions/service", () => realService);
});

const call = (app: { handle: (r: Request) => Promise<Response> }, method: string, path: string, body?: unknown) =>
  app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  for (const value of Object.values(service)) {
    if (typeof value === "function" && "mockClear" in value) {
      (value as { mockClear: () => void }).mockClear();
    }
  }
  service.deleteUser.mockImplementation(async () => "ok");
  service.deleteRouteGrant.mockImplementation(async () => "ok");
  service.deleteResourceGrant.mockImplementation(async () => "ok");
  service.createRouteGrant.mockImplementation(async () => ({
    kind: "created",
    grant: { id: "g", routeKey: "k", status: "ok" },
  }));
  service.createResourceGrant.mockImplementation(async () => ({
    kind: "created",
    grant: { id: "r" },
  }));
  service.getUser.mockImplementation(async () => null);
});

describe("me", () => {
  test("returns the identified user and stored grants", async () => {
    const res = await call(meRoutes, "GET", "/api/me");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      uid: TEST_USER.uid,
      username: TEST_USER.username,
      name: TEST_USER.name,
      routes: [],
      resources: [],
    });
  });
});

describe("users", () => {
  test("list", async () => {
    service.listUsers.mockImplementation(async () => []) as never;
    const res = await call(permissionsRoutes, "GET", "/api/permissions/users");
    expect(res.status).toBe(200);
  });

  test("grants: 404 and 200", async () => {
    expect((await call(permissionsRoutes, "GET", "/api/permissions/users/x/grants")).status).toBe(404);
    service.getUser.mockImplementation(async () => ({ id: "u1" }) as never);
    expect((await call(permissionsRoutes, "GET", "/api/permissions/users/u1/grants")).status).toBe(200);
  });

  test("delete: 404, 409 and ok", async () => {
    service.deleteUser.mockImplementation(async () => "not_found");
    expect((await call(permissionsRoutes, "DELETE", "/api/permissions/users/x")).status).toBe(404);
    service.deleteUser.mockImplementation(async () => "last_manager");
    expect((await call(permissionsRoutes, "DELETE", "/api/permissions/users/x")).status).toBe(409);
    service.deleteUser.mockImplementation(async () => "ok");
    expect(await (await call(permissionsRoutes, "DELETE", "/api/permissions/users/x")).json()).toEqual({ ok: true });
  });
});

describe("route grants", () => {
  test("create: 404, 400, 201 and 200", async () => {
    service.createRouteGrant.mockImplementation(async () => ({ kind: "user_not_found" }));
    expect((await call(permissionsRoutes, "POST", "/api/permissions/users/x/route-grants", { routeKey: "k" })).status).toBe(404);
    service.createRouteGrant.mockImplementation(async () => ({ kind: "unknown_route" }));
    expect((await call(permissionsRoutes, "POST", "/api/permissions/users/x/route-grants", { routeKey: "k" })).status).toBe(400);
    service.createRouteGrant.mockImplementation(async () => ({ kind: "created", grant: { id: "g", routeKey: "k", status: "ok" } }));
    expect((await call(permissionsRoutes, "POST", "/api/permissions/users/x/route-grants", { routeKey: "k" })).status).toBe(201);
    service.createRouteGrant.mockImplementation(async () => ({ kind: "exists", grant: { id: "g", routeKey: "k", status: "ok" } }));
    expect((await call(permissionsRoutes, "POST", "/api/permissions/users/x/route-grants", { routeKey: "k" })).status).toBe(200);
  });

  test("invalid body is a 422", async () => {
    expect((await call(permissionsRoutes, "POST", "/api/permissions/users/x/route-grants", {})).status).toBe(422);
  });

  test("delete: 404, 409 and ok", async () => {
    service.deleteRouteGrant.mockImplementation(async () => "not_found");
    expect((await call(permissionsRoutes, "DELETE", "/api/permissions/route-grants/g")).status).toBe(404);
    service.deleteRouteGrant.mockImplementation(async () => "last_manager");
    expect((await call(permissionsRoutes, "DELETE", "/api/permissions/route-grants/g")).status).toBe(409);
    service.deleteRouteGrant.mockImplementation(async () => "ok");
    expect((await call(permissionsRoutes, "DELETE", "/api/permissions/route-grants/g")).status).toBe(200);
  });
});

describe("resource grants", () => {
  test("create covers every result", async () => {
    const post = () =>
      call(permissionsRoutes, "POST", "/api/permissions/users/x/resource-grants", {
        resourceType: "tuya_device",
        resourceId: "d",
        action: "read",
      });
    service.createResourceGrant.mockImplementation(async () => ({ kind: "user_not_found" }));
    expect((await post()).status).toBe(404);
    service.createResourceGrant.mockImplementation(async () => ({ kind: "invalid_action" }));
    expect((await post()).status).toBe(400);
    service.createResourceGrant.mockImplementation(async () => ({ kind: "unknown_resource" }));
    expect((await post()).status).toBe(400);
    service.createResourceGrant.mockImplementation(async () => ({ kind: "frigate_unavailable" }));
    expect((await post()).status).toBe(502);
    service.createResourceGrant.mockImplementation(async () => ({ kind: "created", grant: { id: "r" } }));
    expect((await post()).status).toBe(201);
    service.createResourceGrant.mockImplementation(async () => ({ kind: "exists", grant: { id: "r" } }));
    expect((await post()).status).toBe(200);
  });

  test("delete: 404 and ok", async () => {
    service.deleteResourceGrant.mockImplementation(async () => "not_found");
    expect((await call(permissionsRoutes, "DELETE", "/api/permissions/resource-grants/r")).status).toBe(404);
    service.deleteResourceGrant.mockImplementation(async () => "ok");
    expect((await call(permissionsRoutes, "DELETE", "/api/permissions/resource-grants/r")).status).toBe(200);
  });
});

describe("pickers", () => {
  test("routes and resources", async () => {
    expect((await call(permissionsRoutes, "GET", "/api/permissions/routes")).status).toBe(200);
    const res = await call(permissionsRoutes, "GET", "/api/permissions/resources");
    expect(await res.json()).toEqual({ resources: [], frigateAvailable: true });
  });
});
