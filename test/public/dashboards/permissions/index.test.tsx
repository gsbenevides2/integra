// Must load first: the dashboards import this module back (cycle).
import "@public/components/GlobalDrawerContext";

import React from "react";

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "bun:test";

import { fail, malformed, useApi } from "../../../helpers/dash-api";
import { renderWithMe } from "../../../helpers/me";

const MANAGER = "POST /api/permissions/users/:id/route-grants";

const users = [
  { id: "u1", uid: "uid-1", username: "alice", createdAt: "", updatedAt: "" },
  { id: "u2", uid: "uid-2", username: "bob", createdAt: "", updatedAt: "" },
];

const routeOptions = [
  { key: "GET /api/tuya/devices", method: "GET", path: "/api/tuya/devices", tag: "Tuya", summary: "List Devices" },
  { key: "DELETE /api/tuya/devices/:id", method: "DELETE", path: "/api/tuya/devices/:id", tag: "Tuya", summary: "Delete Device" },
  { key: MANAGER, method: "POST", path: "/api/permissions/users/:id/route-grants", tag: "Permissions", summary: "Grant Route" },
  { key: "TRACE /x", method: "TRACE", path: "/x", tag: "Other", summary: "Odd Method" },
];

const resourceOptions = [
  { resourceType: "tuya_device", resourceId: "d1", label: "Lamp", actions: ["read", "write"] },
  { resourceType: "frigate_camera", resourceId: "frente", label: "frente", actions: ["read"] },
  { resourceType: "frigate_camera", resourceId: "tras", label: "tras", actions: ["read"] },
  { resourceType: "cron_job", resourceId: "job", label: "Job", actions: ["read", "execute"] },
];

interface Cfg {
  users?: unknown;
  grants?: unknown;
  resources?: unknown;
  frigateAvailable?: boolean;
  failUsers?: boolean;
  malformedUsers?: boolean;
  malformedGrants?: boolean;
  failGrants?: boolean;
  failRouteGrant?: boolean;
  malformedRouteGrant?: boolean;
  failRouteDelete?: boolean;
  failResourceGrant?: boolean;
  failResourceDelete?: boolean;
}

let cfg: Cfg = {};

const calls = useApi({
  "GET /api/permissions/users": () =>
    cfg.failUsers ? fail(500) : cfg.malformedUsers ? malformed() : (cfg.users ?? users),
  "GET /api/permissions/users/:id/grants": () =>
    cfg.failGrants
      ? fail(500, { error: "grants down" })
      : cfg.malformedGrants
        ? malformed()
        : (cfg.grants ?? { routes: [], resources: [] }),
  "GET /api/permissions/routes": () => routeOptions,
  "GET /api/permissions/resources": () => ({
    resources: cfg.resources ?? resourceOptions,
    frigateAvailable: cfg.frigateAvailable ?? true,
  }),
  "POST /api/permissions/users/:id/route-grants": () =>
    cfg.malformedRouteGrant
      ? malformed()
      : cfg.failRouteGrant
        ? fail(500, { error: "boom" })
        : { id: "gr" },
  "POST /api/permissions/users/:id/resource-grants": () =>
    cfg.failResourceGrant ? fail(500, { error: "boom" }) : { id: "rr" },
  "DELETE /api/permissions/route-grants/:grantId": () =>
    cfg.failRouteDelete
      ? fail(409, { error: "Cannot remove the last permission manager" })
      : { ok: true },
  "DELETE /api/permissions/resource-grants/:grantId": () =>
    cfg.failResourceDelete ? fail(500, { error: "boom" }) : { ok: true },
});

beforeEach(() => {
  cfg = {};
});
afterEach(cleanup);

const {
  PermissionsDashboard,
  permissionsDashboard,
  errorText,
  matchesSearch,
  buildResourceSections,
} = await import("@public/dashboards/permissions/index");

const posts = (suffix: string) =>
  calls.filter((c) => c.method === "POST" && c.path.endsWith(suffix));
const deletes = (fragment: string) =>
  calls.filter((c) => c.method === "DELETE" && c.path.includes(fragment));

const section = (name: string) => screen.getByRole("region", { name });

async function renderLoaded() {
  renderWithMe(<PermissionsDashboard />);
  await screen.findByRole("option", { name: /alice/ });
}

test("errorText unwraps server error and message bodies", () => {
  expect(errorText({ value: { error: "nope" } }, "fallback")).toBe("nope");
  expect(errorText({ value: { message: "m" } }, "fallback")).toBe("m");
  expect(errorText({ message: "top" }, "fallback")).toBe("top");
  expect(errorText(null, "fallback")).toBe("fallback");
  expect(errorText({}, "fallback")).toBe("fallback");
  expect(errorText({ value: "x" }, "fallback")).toBe("fallback");
});

test("matchesSearch ignores case, accents and blank queries", () => {
  expect(matchesSearch("", "anything")).toBe(true);
  expect(matchesSearch("  ", "anything")).toBe(true);
  expect(matchesSearch("câmera", "List Cameras")).toBe(true);
  expect(matchesSearch("LAMP", "x", "lamp")).toBe(true);
  expect(matchesSearch("fan", "Lamp")).toBe(false);
});

test("buildResourceSections orders types and appends orphaned grants", () => {
  const sections = buildResourceSections(
    [
      { resourceType: "cron_job", resourceId: "j", label: "Job", actions: ["read"] },
      { resourceType: "tuya_device", resourceId: "b", label: "B", actions: ["read"] },
      { resourceType: "tuya_device", resourceId: "a", label: "A", actions: ["read"] },
    ],
    [
      { id: "1", resourceType: "tuya_device", resourceId: "a", action: "read", label: "A", status: "ok" },
      { id: "2", resourceType: "frigate_camera", resourceId: "cam", action: "read", label: null, status: "unverified" },
      { id: "3", resourceType: "tuya_device", resourceId: "gone", action: "read", label: null, status: "orphaned" },
      { id: "4", resourceType: "tuya_device", resourceId: "gone", action: "write", label: null, status: "orphaned" },
      { id: "5", resourceType: "zzz", resourceId: "q", action: "read", label: "Q", status: "orphaned" },
      { id: "6", resourceType: "aaa", resourceId: "q", action: "read", label: "Q", status: "orphaned" },
    ],
  );
  expect(sections.map((s) => s.type)).toEqual([
    "frigate_camera",
    "tuya_device",
    "cron_job",
    "aaa",
    "zzz",
  ]);
  expect(sections[0]!.rows[0]).toMatchObject({ label: "cam", flag: "não verificada" });
  const devices = sections[1]!.rows;
  expect(devices.map((r) => r.label)).toEqual(["A", "B", "gone"]);
  expect(devices[2]).toMatchObject({ actions: ["read", "write"], flag: "órfã" });
});

test("exports the dashboard descriptor", () => {
  expect(permissionsDashboard.id).toBe("permissions");
  expect(permissionsDashboard.content).toBe(PermissionsDashboard);
  expect(permissionsDashboard.name).toBe("Permissões");
});

test("shows the loading state", () => {
  renderWithMe(<PermissionsDashboard />);
  expect(screen.getByText("Carregando permissões...")).toBeTruthy();
});

test("shows the empty state", async () => {
  cfg.users = [];
  renderWithMe(<PermissionsDashboard />);
  await screen.findByText("Nenhum usuário registrado");
});

test("shows an error with retry when the API fails", async () => {
  cfg.failUsers = true;
  renderWithMe(<PermissionsDashboard />);
  await screen.findByText("Não foi possível carregar as permissões");
  cfg.failUsers = false;
  fireEvent.click(screen.getByText("Tentar novamente"));
  await screen.findByRole("option", { name: /alice/ });
});

test("shows an error when the request itself rejects", async () => {
  cfg.malformedUsers = true;
  renderWithMe(<PermissionsDashboard />);
  await screen.findByText("Não foi possível carregar as permissões");
});

test("toasts when a user's grants cannot be loaded", async () => {
  cfg.malformedGrants = true;
  renderWithMe(<PermissionsDashboard />);
  await screen.findByText("Falha ao carregar permissões do usuário");
});

test("hides the grant lists when they fail to load, and retries", async () => {
  cfg.failGrants = true;
  await renderLoaded();
  await screen.findByText("grants down");
  expect(screen.getByText("Não foi possível carregar as permissões deste usuário")).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Câmeras" })).toBeNull();
  cfg.failGrants = false;
  fireEvent.click(screen.getByText("Tentar novamente"));
  await screen.findByRole("region", { name: "Câmeras" });
});

test("lists every camera and device with its grant state", async () => {
  cfg.grants = {
    routes: [{ id: "m", routeKey: MANAGER, status: "ok" }],
    resources: [
      { id: "r1", resourceType: "frigate_camera", resourceId: "frente", action: "read", label: "frente", status: "ok" },
      { id: "r2", resourceType: "tuya_device", resourceId: "d1", action: "write", label: "Lamp", status: "ok" },
    ],
  };
  await renderLoaded();
  await screen.findByText("Gerenciador de permissões");
  const cameras = section("Câmeras");
  expect(within(cameras).getByText("(1/2)")).toBeTruthy();
  expect(within(cameras).getByLabelText("Ler frente").getAttribute("aria-pressed")).toBe("true");
  expect(within(cameras).getByLabelText("Ler tras").getAttribute("aria-pressed")).toBe("false");
  // write implies read: the read chip shows as on, but can't be toggled.
  const impliedRead = screen.getByLabelText("Ler Lamp") as HTMLButtonElement;
  expect(impliedRead.getAttribute("aria-pressed")).toBe("true");
  expect(impliedRead.disabled).toBe(true);
  expect(screen.getByText("Recursos (2)")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Abrir menu"));
});

test("switches the selected user", async () => {
  await renderLoaded();
  fireEvent.click(screen.getByRole("option", { name: /bob/ }));
  await screen.findByText("uid: uid-2");
  await waitFor(() =>
    expect(calls.some((c) => c.path === "/api/permissions/users/u2/grants")).toBe(true),
  );
});

test("toggles a resource grant on and off", async () => {
  await renderLoaded();
  fireEvent.click(screen.getByLabelText("Ler tras"));
  await waitFor(() => expect(posts("/resource-grants").length).toBe(1));
  expect(posts("/resource-grants")[0]!.body).toEqual({
    resourceType: "frigate_camera",
    resourceId: "tras",
    action: "read",
  });

  cleanup();
  cfg.grants = {
    routes: [],
    resources: [
      { id: "r1", resourceType: "frigate_camera", resourceId: "tras", action: "read", label: "tras", status: "ok" },
    ],
  };
  await renderLoaded();
  await waitFor(() =>
    expect(screen.getByLabelText("Ler tras").getAttribute("aria-pressed")).toBe("true"),
  );
  fireEvent.click(screen.getByLabelText("Ler tras"));
  await waitFor(() => expect(deletes("/resource-grants/r1").length).toBe(1));
});

test("grants read on a whole section and removes it again", async () => {
  cfg.grants = {
    routes: [],
    resources: [
      { id: "r1", resourceType: "frigate_camera", resourceId: "frente", action: "read", label: "frente", status: "ok" },
    ],
  };
  await renderLoaded();
  await within(section("Câmeras")).findByText("(1/2)");
  fireEvent.click(within(section("Câmeras")).getByText("Liberar leitura de todos"));
  await waitFor(() => expect(posts("/resource-grants").length).toBe(1));
  expect(posts("/resource-grants")[0]!.body.resourceId).toBe("tras");
  fireEvent.click(within(section("Câmeras")).getByText("Remover todos"));
  await waitFor(() => expect(deletes("/resource-grants/").length).toBe(1));
});

test("surfaces failed resource grants and removals", async () => {
  cfg.failResourceGrant = true;
  cfg.failResourceDelete = true;
  cfg.grants = {
    routes: [],
    resources: [
      { id: "r1", resourceType: "cron_job", resourceId: "job", action: "read", label: "Job", status: "ok" },
    ],
  };
  await renderLoaded();
  fireEvent.click(screen.getByLabelText("Ler frente"));
  await screen.findByText("boom");
  await waitFor(() =>
    expect(screen.getByLabelText("Ler Job").getAttribute("aria-pressed")).toBe("true"),
  );
  fireEvent.click(screen.getByLabelText("Ler Job"));
  await waitFor(() => expect(screen.getAllByText("boom").length).toBe(2));
});

test("orphaned grants can be removed but not granted", async () => {
  cfg.frigateAvailable = false;
  cfg.resources = [];
  cfg.grants = {
    routes: [],
    resources: [
      { id: "r1", resourceType: "frigate_camera", resourceId: "cam", action: "read", label: null, status: "unverified" },
    ],
  };
  await renderLoaded();
  await screen.findByText("Frigate indisponível: câmeras não verificadas.");
  await screen.findByText("(não verificada)");
  const removeAll = within(section("Câmeras")).getByText("Remover todos");
  expect(
    (within(section("Câmeras")).getByText("Liberar leitura de todos") as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(removeAll);
  await waitFor(() => expect(deletes("/resource-grants/r1").length).toBe(1));
});

test("filters resources by search", async () => {
  await renderLoaded();
  fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "lamp" } });
  expect(screen.getByText("Lamp")).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Câmeras" })).toBeNull();
});

test("shows each device and sensor kind and searches by it", async () => {
  cfg.resources = [
    ...resourceOptions,
    { resourceType: "tuya_sensor", resourceId: "s1", label: "Entrada", actions: ["read"], kind: "door" },
    { resourceType: "tuya_sensor", resourceId: "s2", label: "Sala", actions: ["read"], kind: "motion" },
    { resourceType: "tuya_sensor", resourceId: "s3", label: "Novo", actions: ["read"], kind: "weird" },
    { resourceType: "tuya_device", resourceId: "d2", label: "Teto", actions: ["read"], kind: "lamp" },
  ];
  await renderLoaded();
  expect(within(section("Sensores Tuya")).getByText("Porta")).toBeTruthy();
  expect(within(section("Sensores Tuya")).getByText("Presença")).toBeTruthy();
  expect(within(section("Sensores Tuya")).getByText("weird")).toBeTruthy();
  expect(within(section("Dispositivos Tuya")).getByText("Lâmpada")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "presenca" } });
  expect(screen.getByText("Sala")).toBeTruthy();
  expect(screen.queryByText("Entrada")).toBeNull();
});

test("routes tab toggles, bulk-grants and filters routes", async () => {
  cfg.grants = {
    routes: [{ id: "g1", routeKey: "GET /api/tuya/devices", status: "ok" }],
    resources: [],
  };
  await renderLoaded();
  fireEvent.click(screen.getByRole("tab", { name: /Rotas/ }));
  const tuya = section("Tuya");
  await within(tuya).findByText("(1/2)");
  expect(screen.getByText("TRACE")).toBeTruthy();

  const [listSwitch, deleteSwitch] = within(tuya).getAllByRole("switch");
  fireEvent.click(deleteSwitch!);
  await waitFor(() => expect(posts("/route-grants").length).toBe(1));
  expect(posts("/route-grants")[0]!.body).toEqual({ routeKey: "DELETE /api/tuya/devices/:id" });

  fireEvent.click(listSwitch!);
  await waitFor(() => expect(deletes("/route-grants/g1").length).toBe(1));

  fireEvent.click(within(section("Permissions")).getByText("Liberar todas"));
  await waitFor(() => expect(posts("/route-grants").length).toBe(2));

  fireEvent.click(within(tuya).getByText("Remover todas"));
  await waitFor(() => expect(deletes("/route-grants/g1").length).toBe(2));

  fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "odd" } });
  expect(screen.queryByRole("region", { name: "Tuya" })).toBeNull();
  expect(screen.getByRole("region", { name: "Other" })).toBeTruthy();
});

test("removing your own manager grant asks for confirmation", async () => {
  cfg.grants = {
    routes: [{ id: "m", routeKey: MANAGER, status: "ok" }],
    resources: [],
  };
  renderWithMe(<PermissionsDashboard />, {
    uid: "uid-1",
    username: "alice",
    name: "Alice",
    routes: [],
    resources: [],
  });
  await screen.findByRole("option", { name: /alice/ });
  fireEvent.click(screen.getByRole("tab", { name: /Rotas/ }));
  await within(section("Permissions")).findByText("(1/1)");

  fireEvent.click(within(section("Permissions")).getByRole("switch"));
  fireEvent.click(await screen.findByText("Cancelar"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(deletes("/route-grants/m").length).toBe(0);

  fireEvent.click(within(section("Permissions")).getByRole("switch"));
  fireEvent.click(await screen.findByText("Confirmar"));
  await waitFor(() => expect(deletes("/route-grants/m").length).toBe(1));
});

test("lists orphaned route grants and surfaces failures", async () => {
  cfg.failRouteDelete = true;
  cfg.grants = {
    routes: [{ id: "g2", routeKey: "GET /api/gone", status: "orphaned" }],
    resources: [],
  };
  await renderLoaded();
  fireEvent.click(screen.getByRole("tab", { name: /Rotas/ }));
  await screen.findByText("GET /api/gone");
  expect(screen.getByText("(órfã)")).toBeTruthy();
  fireEvent.click(screen.getByText("Remover"));
  await screen.findByText("Cannot remove the last permission manager");
});

test("surfaces failed and rejected route grants", async () => {
  cfg.failRouteGrant = true;
  await renderLoaded();
  fireEvent.click(screen.getByRole("tab", { name: /Rotas/ }));
  fireEvent.click(within(section("Other")).getByRole("switch"));
  await screen.findByText("boom");

  cfg.malformedRouteGrant = true;
  fireEvent.click(within(section("Other")).getByRole("switch"));
  await screen.findByText("Falha ao conceder rota");
});
