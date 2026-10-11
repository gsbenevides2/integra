// Must load first: the dashboards import this module back (cycle).
import "@public/components/GlobalDrawerContext";

import React from "react";

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "bun:test";

import { fail, useApi } from "../../../helpers/dash-api";
import { renderWithMe } from "../../../helpers/me";

const users = [
  { id: "u1", uid: "uid-1", username: "alice", createdAt: "", updatedAt: "" },
  { id: "u2", uid: "uid-2", username: "bob", createdAt: "", updatedAt: "" },
];

const routeOptions = [
  { key: "GET /api/tuya/devices", method: "GET", path: "/api/tuya/devices", tag: "Tuya", summary: "List Devices" },
  { key: "POST /api/permissions/users/:id/route-grants", method: "POST", path: "/api/permissions/users/:id/route-grants", tag: "Permissions", summary: "Grant Route" },
];

const resourceOptions = [
  { resourceType: "tuya_device", resourceId: "d1", label: "Lamp", actions: ["read", "write"] },
  { resourceType: "cron_job", resourceId: "job", label: "Job", actions: ["read", "execute"] },
];

interface Cfg {
  users?: unknown;
  grants?: unknown;
  resources?: unknown;
  frigateAvailable?: boolean;
  failRouteGrant?: boolean;
  failRouteDelete?: boolean;
  failResourceGrant?: boolean;
  failResourceDelete?: boolean;
  routeDeleteError?: string;
}

let cfg: Cfg = {};

const calls = useApi({
  "GET /api/permissions/users": () => cfg.users ?? users,
  "GET /api/permissions/users/:id/grants": () =>
    cfg.grants ?? { routes: [], resources: [] },
  "GET /api/permissions/routes": () => routeOptions,
  "GET /api/permissions/resources": () => ({
    resources: cfg.resources ?? resourceOptions,
    frigateAvailable: cfg.frigateAvailable ?? true,
  }),
  "POST /api/permissions/users/:id/route-grants": () =>
    cfg.failRouteGrant
      ? fail(500, { error: "boom" })
      : { id: "gr", routeKey: "GET /api/tuya/devices", status: "ok" },
  "POST /api/permissions/users/:id/resource-grants": () =>
    cfg.failResourceGrant ? fail(500, { error: "boom" }) : { id: "rr" },
  "DELETE /api/permissions/route-grants/:grantId": () =>
    cfg.routeDeleteError
      ? fail(409, { error: cfg.routeDeleteError })
      : cfg.failRouteDelete
        ? fail(500, { error: "boom" })
        : { ok: true },
  "DELETE /api/permissions/resource-grants/:grantId": () =>
    cfg.failResourceDelete ? fail(500, { error: "boom" }) : { ok: true },
});

beforeEach(() => {
  cfg = {};
});
afterEach(cleanup);

const { PermissionsDashboard, permissionsDashboard, errorText } = await import(
  "@public/dashboards/permissions/index"
);

test("errorText unwraps server error and message bodies", () => {
  expect(errorText({ value: { error: "nope" } }, "fallback")).toBe("nope");
  expect(errorText({ value: { message: "m" } }, "fallback")).toBe("m");
  expect(errorText({ message: "top" }, "fallback")).toBe("top");
  expect(errorText(null, "fallback")).toBe("fallback");
  expect(errorText({}, "fallback")).toBe("fallback");
  expect(errorText({ value: "x" }, "fallback")).toBe("fallback");
});

test("exports the dashboard descriptor", () => {
  expect(permissionsDashboard.id).toBe("permissions");
  expect(permissionsDashboard.content).toBe(PermissionsDashboard);
  expect(permissionsDashboard.name).toBe("Permissões");
});

test("renders users, grants, flags and the manager marker", async () => {
  cfg.grants = {
    routes: [
      { id: "g1", routeKey: "GET /api/tuya/devices", status: "ok" },
      { id: "g2", routeKey: "GET /api/gone", status: "orphaned" },
      { id: "g3", routeKey: "POST /api/permissions/users/:id/route-grants", status: "ok" },
    ],
    resources: [
      { id: "r1", resourceType: "tuya_device", resourceId: "d1", action: "write", label: "Lamp", status: "ok" },
      { id: "r2", resourceType: "cron_job", resourceId: "job", action: "execute", label: "Job", status: "orphaned" },
      { id: "r4", resourceType: "frigate_camera", resourceId: "cam", action: "read", label: null, status: "unverified" },
    ],
  };
  renderWithMe(<PermissionsDashboard />);
  expect(await screen.findByText("GET /api/tuya/devices")).toBeTruthy();
  expect(screen.getByText("Gerenciador de permissões")).toBeTruthy();
  expect(screen.getAllByText("(órfã)").length).toBe(2);
  expect(screen.getByText("(não verificada)")).toBeTruthy();
  expect(screen.getAllByText("(inclui leitura)").length).toBe(2);
  expect(screen.getByText("Dispositivos Tuya")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Abrir menu"));
});

test("omits the implied-read hint when an explicit read grant exists", async () => {
  cfg.grants = {
    routes: [],
    resources: [
      { id: "r1", resourceType: "tuya_device", resourceId: "d1", action: "read", label: "Lamp", status: "ok" },
      { id: "r2", resourceType: "tuya_device", resourceId: "d1", action: "write", label: "Lamp", status: "ok" },
    ],
  };
  renderWithMe(<PermissionsDashboard />);
  await screen.findByText(/Lamp — Editar/);
  expect(screen.queryByText("(inclui leitura)")).toBeNull();
});

test("adds a route grant", async () => {
  renderWithMe(<PermissionsDashboard />);
  await screen.findByText("alice");
  fireEvent.change(screen.getByLabelText("Rota"), { target: { value: "GET /api/tuya/devices" } });
  fireEvent.click(screen.getAllByText("Adicionar")[0]!);
  await screen.findByText("Permissão de rota concedida");
  expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/route-grants"))).toBe(true);
});

test("adds a resource grant with an action", async () => {
  renderWithMe(<PermissionsDashboard />);
  await screen.findByText("alice");
  fireEvent.change(screen.getByLabelText("Recurso"), { target: { value: "tuya_device:d1" } });
  await screen.findByLabelText("Ação");
  fireEvent.change(screen.getByLabelText("Ação"), { target: { value: "write" } });
  fireEvent.click(screen.getAllByText("Adicionar")[1]!);
  await screen.findByText("Permissão de recurso concedida");
  const post = calls.find((c) => c.method === "POST" && c.path.endsWith("/resource-grants"));
  expect(post?.body).toEqual({ resourceType: "tuya_device", resourceId: "d1", action: "write" });
});

test("removes a resource grant and surfaces failures", async () => {
  cfg.grants = {
    routes: [],
    resources: [
      { id: "r1", resourceType: "tuya_device", resourceId: "d1", action: "read", label: "Lamp", status: "ok" },
    ],
  };
  cfg.failResourceDelete = true;
  renderWithMe(<PermissionsDashboard />);
  await screen.findByText(/Lamp — Ler/);
  fireEvent.click(screen.getByText("Remover"));
  await screen.findByText("boom");
});

test("removes a route grant, confirming the user's own management grant", async () => {
  cfg.grants = {
    routes: [
      { id: "m", routeKey: "POST /api/permissions/users/:id/route-grants", status: "ok" },
    ],
    resources: [],
  };
  renderWithMe(<PermissionsDashboard />, {
    uid: "uid-1",
    username: "alice",
    name: "Alice",
    routes: [],
    resources: [],
  });
  await screen.findByText("POST /api/permissions/users/:id/route-grants");
  fireEvent.click(screen.getByText("Remover"));
  const confirm = await screen.findByText("Confirmar");
  fireEvent.click(confirm);
  await screen.findByText("Permissão removida");
});

test("shows the empty state", async () => {
  cfg.users = [];
  renderWithMe(<PermissionsDashboard />);
  await screen.findByText("Nenhum usuário registrado");
});

test("notes when frigate is unavailable", async () => {
  cfg.frigateAvailable = false;
  cfg.resources = [];
  renderWithMe(<PermissionsDashboard />);
  await screen.findByText("Frigate indisponível: câmeras não verificadas.");
});

test("shows the loading state", () => {
  renderWithMe(<PermissionsDashboard />);
  expect(screen.getByText("Carregando permissões...")).toBeTruthy();
});

test("surfaces a failed route grant as an error toast", async () => {
  cfg.failRouteGrant = true;
  renderWithMe(<PermissionsDashboard />);
  await screen.findByText("alice");
  fireEvent.change(screen.getByLabelText("Rota"), { target: { value: "GET /api/tuya/devices" } });
  fireEvent.click(screen.getAllByText("Adicionar")[0]!);
  await screen.findByText("boom");
});

test("surfaces a failed resource grant as an error toast", async () => {
  cfg.failResourceGrant = true;
  renderWithMe(<PermissionsDashboard />);
  await screen.findByText("alice");
  fireEvent.change(screen.getByLabelText("Recurso"), { target: { value: "tuya_device:d1" } });
  await screen.findByLabelText("Ação");
  fireEvent.click(screen.getAllByText("Adicionar")[1]!);
  await screen.findByText("boom");
});

test("removes a resource grant successfully", async () => {
  cfg.grants = {
    routes: [],
    resources: [
      { id: "r1", resourceType: "tuya_device", resourceId: "d1", action: "read", label: "Lamp", status: "ok" },
    ],
  };
  renderWithMe(<PermissionsDashboard />);
  await screen.findByText(/Lamp — Ler/);
  fireEvent.click(screen.getByText("Remover"));
  await screen.findByText("Permissão removida");
});

test("surfaces a failed route grant removal", async () => {
  cfg.grants = {
    routes: [
      { id: "g1", routeKey: "GET /api/tuya/devices", status: "ok" },
    ],
    resources: [],
  };
  cfg.failRouteDelete = true;
  renderWithMe(<PermissionsDashboard />);
  await screen.findByText("GET /api/tuya/devices");
  fireEvent.click(screen.getByText("Remover"));
  await screen.findByText("boom");
});

test("shows the server's 409 message when the last manager cannot be removed", async () => {
  cfg.grants = {
    routes: [
      { id: "g1", routeKey: "GET /api/tuya/devices", status: "ok" },
    ],
    resources: [],
  };
  cfg.routeDeleteError = "Cannot remove the last permission manager";
  renderWithMe(<PermissionsDashboard />);
  await screen.findByText("GET /api/tuya/devices");
  fireEvent.click(screen.getByText("Remover"));
  await screen.findByText("Cannot remove the last permission manager");
});

test("ignores add clicks without a selection", async () => {
  renderWithMe(<PermissionsDashboard />);
  await screen.findByText("alice");
  fireEvent.click(screen.getAllByText("Adicionar")[0]!);
  fireEvent.click(screen.getAllByText("Adicionar")[1]!);
  await waitFor(() => expect(screen.queryByText("Permissão de rota concedida")).toBeNull());
});
