import React, { useCallback, useEffect, useState } from "react";

import { MANAGER_ROUTE_KEY } from "@server/modules/permissions/constants";
import { Button } from "@public/components/Button";
import { useConfirm } from "@public/components/ConfirmContext";
import {
  DashboardData,
  useGlobalDrawer,
} from "@public/components/GlobalDrawerContext";
import { IconButton } from "@public/components/IconButton";
import { initialsOf, useMe } from "@public/components/MeContext";
import { Switch } from "@public/components/Switch";
import { useToast } from "@public/components/Toast";

import {
  Bars3Icon,
  KeyIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

import { getPermissionsEdenClient } from "./client";

interface UserRow {
  id: string;
  uid: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}

interface RouteGrant {
  id: string;
  routeKey: string;
  status: "ok" | "orphaned";
}

interface ResourceGrant {
  id: string;
  resourceType: string;
  resourceId: string;
  action: string;
  label: string | null;
  status: "ok" | "orphaned" | "unverified";
}

interface Grants {
  routes: RouteGrant[];
  resources: ResourceGrant[];
}

interface RouteOption {
  key: string;
  method: string;
  path: string;
  tag: string;
  summary: string;
}

interface ResourceOption {
  resourceType: string;
  resourceId: string;
  label: string;
  actions: string[];
}

type Tab = "resources" | "routes";

export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  frigate_camera: "Câmeras",
  tuya_device: "Dispositivos Tuya",
  tuya_sensor: "Sensores Tuya",
  tuya_preset: "Modos Tuya",
  cron_job: "Crons",
};

/** Section order on the resources tab; unknown types are appended after these. */
const RESOURCE_TYPE_ORDER = Object.keys(RESOURCE_TYPE_LABELS);

export const ACTION_LABELS: Record<string, string> = {
  read: "Ler",
  write: "Editar",
  apply: "Aplicar",
  execute: "Executar",
};

const STATUS_FLAGS: Record<string, string> = {
  orphaned: "órfã",
  unverified: "não verificada",
};

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-blue-900 text-blue-200",
  POST: "bg-green-900 text-green-200",
  PUT: "bg-yellow-900 text-yellow-200",
  PATCH: "bg-yellow-900 text-yellow-200",
  DELETE: "bg-red-900 text-red-200",
};

/** Pulls the server's `{ error }` (or `{ message }`) text out of an Eden error. */
export function errorText(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const candidate = error as {
      value?: { error?: unknown; message?: unknown };
      message?: unknown;
    };
    const value = candidate.value;
    if (value && typeof value === "object") {
      if (typeof value.error === "string") return value.error;
      if (typeof value.message === "string") return value.message;
    }
    if (typeof candidate.message === "string") return candidate.message;
  }
  return fallback;
}

/** Case- and accent-insensitive substring match used by the search box. */
export function matchesSearch(search: string, ...fields: string[]): boolean {
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  const needle = normalize(search.trim());
  if (!needle) return true;
  return fields.some((field) => normalize(field).includes(needle));
}

interface ResourceRow {
  resourceType: string;
  resourceId: string;
  label: string;
  actions: string[];
  /** Set when the resource only exists as a grant (no longer in the catalog). */
  flag?: string;
}

/**
 * Every catalog resource plus any granted resource the catalog no longer has,
 * grouped by type in display order.
 */
export function buildResourceSections(
  resources: ResourceOption[],
  grants: ResourceGrant[],
): { type: string; rows: ResourceRow[] }[] {
  const byType = new Map<string, ResourceRow[]>();
  const keyOf = (type: string, id: string) => `${type}:${id}`;
  const known = new Set<string>();
  for (const resource of resources) {
    known.add(keyOf(resource.resourceType, resource.resourceId));
    byType.set(resource.resourceType, [
      ...(byType.get(resource.resourceType) ?? []),
      { ...resource },
    ]);
  }
  for (const grant of grants) {
    if (known.has(keyOf(grant.resourceType, grant.resourceId))) continue;
    const rows = byType.get(grant.resourceType) ?? [];
    // Catalog rows were skipped above, so a match here is an earlier orphan row.
    const orphan = rows.find((row) => row.resourceId === grant.resourceId);
    if (orphan) {
      orphan.actions.push(grant.action);
      continue;
    }
    byType.set(grant.resourceType, [
      ...rows,
      {
        resourceType: grant.resourceType,
        resourceId: grant.resourceId,
        label: grant.label ?? grant.resourceId,
        actions: [grant.action],
        flag: STATUS_FLAGS[grant.status],
      },
    ]);
  }
  const rank = (type: string) => {
    const index = RESOURCE_TYPE_ORDER.indexOf(type);
    return index === -1 ? RESOURCE_TYPE_ORDER.length : index;
  };
  return [...byType.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([type, rows]) => ({
      type,
      rows: rows.sort((a, b) => a.label.localeCompare(b.label)),
    }));
}

function FlagText({ flag }: { flag?: string }) {
  if (!flag) return null;
  return <span className="ml-2 text-xs text-yellow-300">({flag})</span>;
}

export function PermissionsDashboard() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { me } = useMe();
  const globalDrawer = useGlobalDrawer();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [grants, setGrants] = useState<Grants>({ routes: [], resources: [] });
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [frigateAvailable, setFrigateAvailable] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("resources");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Set<string>>(new Set());

  const selectedUser = users.find((user) => user.id === selectedUserId);

  const fetchGrants = useCallback(async (userId: string) => {
    if (!userId) {
      setGrants({ routes: [], resources: [] });
      return;
    }
    try {
      const { data } = await getPermissionsEdenClient()
        .api.permissions.users({ id: userId })
        .grants.get();
      if (data) setGrants(data as unknown as Grants);
    } catch {
      showToast("Falha ao carregar permissões do usuário", "error");
    }
  }, [showToast]);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setLoadFailed(false);
    const client = getPermissionsEdenClient();
    try {
      const [usersRes, routesRes, resourcesRes] = await Promise.all([
        client.api.permissions.users.get(),
        client.api.permissions.routes.get(),
        client.api.permissions.resources.get(),
      ]);
      if (usersRes.error || routesRes.error || resourcesRes.error) {
        setLoadFailed(true);
        return;
      }
      setUsers((usersRes.data ?? []) as unknown as UserRow[]);
      setRoutes((routesRes.data ?? []) as unknown as RouteOption[]);
      const payload = resourcesRes.data as unknown as {
        resources?: ResourceOption[];
        frigateAvailable?: boolean;
      } | null;
      setResources(payload?.resources ?? []);
      setFrigateAvailable(payload?.frigateAvailable ?? true);
    } catch {
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!selectedUserId && users[0]) setSelectedUserId(users[0].id);
  }, [users, selectedUserId]);

  useEffect(() => {
    void fetchGrants(selectedUserId);
  }, [selectedUserId, fetchGrants]);

  /** Runs one grant mutation per key, then refreshes the selected user's grants. */
  const mutate = async (
    keys: string[],
    run: () => Promise<{ error: unknown }[]>,
    failMessage: string,
  ) => {
    setPending((prev) => new Set([...prev, ...keys]));
    try {
      const results = await run();
      const failed = results.find((result) => result.error);
      if (failed) showToast(errorText(failed.error, failMessage), "error");
    } catch {
      showToast(failMessage, "error");
    } finally {
      await fetchGrants(selectedUserId);
      setPending((prev) => {
        const next = new Set(prev);
        for (const key of keys) next.delete(key);
        return next;
      });
    }
  };

  const addRouteGrants = (routeKeys: string[]) =>
    mutate(
      routeKeys.map((key) => `route:${key}`),
      () =>
        Promise.all(
          routeKeys.map((routeKey) =>
            getPermissionsEdenClient()
              .api.permissions.users({ id: selectedUserId })
              ["route-grants"].post({ routeKey }),
          ),
        ),
      "Falha ao conceder rota",
    );

  const removeRouteGrants = async (toRemove: RouteGrant[]) => {
    const removesOwnManagement = toRemove.some(
      (grant) =>
        grant.routeKey === MANAGER_ROUTE_KEY && selectedUser?.uid === me?.uid,
    );
    if (removesOwnManagement) {
      const ok = await confirm({
        message:
          "Remover sua própria permissão de gerenciamento? Você pode ficar sem acesso para restaurá-la.",
      });
      if (!ok) return;
    }
    await mutate(
      toRemove.map((grant) => `route:${grant.routeKey}`),
      () =>
        Promise.all(
          toRemove.map((grant) =>
            getPermissionsEdenClient()
              .api.permissions["route-grants"]({ grantId: grant.id })
              .delete(),
          ),
        ),
      "Falha ao remover permissão",
    );
  };

  const addResourceGrants = (
    items: { resourceType: string; resourceId: string; action: string }[],
  ) =>
    mutate(
      items.map((item) => `${item.resourceType}:${item.resourceId}:${item.action}`),
      () =>
        Promise.all(
          items.map((item) =>
            getPermissionsEdenClient()
              .api.permissions.users({ id: selectedUserId })
              ["resource-grants"].post({
                resourceType: item.resourceType as never,
                resourceId: item.resourceId,
                action: item.action as never,
              }),
          ),
        ),
      "Falha ao conceder recurso",
    );

  const removeResourceGrants = (toRemove: ResourceGrant[]) =>
    mutate(
      toRemove.map(
        (grant) => `${grant.resourceType}:${grant.resourceId}:${grant.action}`,
      ),
      () =>
        Promise.all(
          toRemove.map((grant) =>
            getPermissionsEdenClient()
              .api.permissions["resource-grants"]({ grantId: grant.id })
              .delete(),
          ),
        ),
      "Falha ao remover permissão",
    );

  const findResourceGrant = (type: string, id: string, action: string) =>
    grants.resources.find(
      (grant) =>
        grant.resourceType === type &&
        grant.resourceId === id &&
        grant.action === action,
    );

  const isManager =
    selectedUser !== undefined &&
    grants.routes.some((grant) => grant.routeKey === MANAGER_ROUTE_KEY);

  const header = (
    <div className="flex items-center gap-2">
      <IconButton
        onClick={() => globalDrawer.setIsOpen(true)}
        aria-label="Abrir menu"
      >
        <Bars3Icon className="size-5" />
      </IconButton>
      <h1 className="text-xl">Permissões</h1>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-3">
        {header}
        <p className="text-sm text-mist-400">Carregando permissões...</p>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="flex flex-col gap-4 p-3">
        {header}
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-mist-200">Não foi possível carregar as permissões</p>
          <Button onClick={() => void fetchAll()}>Tentar novamente</Button>
        </div>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-3">
        {header}
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <UserGroupIcon className="size-10 text-mist-500" />
          <p className="text-mist-200">Nenhum usuário registrado</p>
        </div>
      </div>
    );
  }

  const sections = buildResourceSections(resources, grants.resources);

  const routeGrantByKey = new Map(
    grants.routes.map((grant) => [grant.routeKey, grant]),
  );
  const knownRouteKeys = new Set(routes.map((route) => route.key));
  const routeGroups = new Map<string, RouteOption[]>();
  for (const route of routes) {
    routeGroups.set(route.tag, [...(routeGroups.get(route.tag) ?? []), route]);
  }
  const orphanRouteGrants = grants.routes.filter(
    (grant) => !knownRouteKeys.has(grant.routeKey),
  );

  const resourceGrantCount = new Set(
    grants.resources.map((grant) => `${grant.resourceType}:${grant.resourceId}`),
  ).size;

  return (
    <div className="flex flex-col gap-4 p-3">
      {header}

      <div
        className="flex gap-2 overflow-x-auto pb-1"
        role="listbox"
        aria-label="Usuários"
      >
        {users.map((user) => {
          const selected = user.id === selectedUserId;
          return (
            <button
              key={user.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => setSelectedUserId(user.id)}
              className={`
                flex shrink-0 cursor-pointer items-center gap-2 rounded-full
                border py-1 pr-4 pl-1 text-sm transition-colors
                ${
                  selected
                    ? "border-blue-500 bg-blue-950 text-white"
                    : `
                      border-gray-700 text-mist-300
                      hover:bg-gray-800
                    `
                }
              `}
            >
              <span className="
                flex size-7 items-center justify-center rounded-full bg-blue-900
                text-xs
              ">
                {initialsOf(user.username)}
              </span>
              {user.username}
            </button>
          );
        })}
      </div>

      {selectedUser && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-mist-400">
          <span className="truncate">uid: {selectedUser.uid}</span>
          {isManager && (
            <span className="
              rounded-full bg-green-950 px-2 py-0.5 text-green-300
            ">
              Gerenciador de permissões
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-gray-800 p-1" role="tablist">
          {(
            [
              ["resources", `Recursos (${resourceGrantCount})`],
              ["routes", `Rotas (${grants.routes.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`
                cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors
                ${tab === id ? "bg-gray-950 text-white" : "text-mist-300"}
              `}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="
          flex min-w-48 flex-1 items-center gap-2 rounded-md border
          border-mist-600 bg-gray-900 px-2
        ">
          <MagnifyingGlassIcon className="size-4 text-mist-400" />
          <input
            aria-label="Buscar"
            placeholder="Buscar"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-0"
          />
        </label>
      </div>

      {tab === "resources" ? (
        <div className="flex flex-col gap-3">
          {!frigateAvailable && (
            <p className="text-xs text-yellow-300">
              Frigate indisponível: câmeras não verificadas.
            </p>
          )}
          {sections.map(({ type, rows }) => {
            const visible = rows.filter((row) =>
              matchesSearch(search, row.label, row.resourceId),
            );
            if (visible.length === 0) return null;
            const typeLabel = RESOURCE_TYPE_LABELS[type] ?? type;
            const withAccess = rows.filter((row) =>
              grants.resources.some(
                (grant) =>
                  grant.resourceType === type &&
                  grant.resourceId === row.resourceId,
              ),
            ).length;
            const missingRead = visible.filter(
              (row) =>
                !row.flag &&
                row.actions.includes("read") &&
                !grants.resources.some(
                  (grant) =>
                    grant.resourceType === type &&
                    grant.resourceId === row.resourceId,
                ),
            );
            const visibleGrants = grants.resources.filter(
              (grant) =>
                grant.resourceType === type &&
                visible.some((row) => row.resourceId === grant.resourceId),
            );
            return (
              <section
                key={type}
                aria-label={typeLabel}
                className="rounded-lg bg-gray-800 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h2 className="flex-1 text-sm text-mist-200">
                    {typeLabel}{" "}
                    <span className="text-mist-400">
                      ({withAccess}/{rows.length})
                    </span>
                  </h2>
                  <Button
                    variant="secondary"
                    disabled={missingRead.length === 0}
                    onClick={() =>
                      void addResourceGrants(
                        missingRead.map((row) => ({
                          resourceType: type,
                          resourceId: row.resourceId,
                          action: "read",
                        })),
                      )
                    }
                  >
                    Liberar leitura de todos
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={visibleGrants.length === 0}
                    onClick={() => void removeResourceGrants(visibleGrants)}
                  >
                    Remover todos
                  </Button>
                </div>
                <ul className="flex flex-col divide-y divide-gray-700">
                  {visible.map((row) => {
                    const rowGrants = grants.resources.filter(
                      (grant) =>
                        grant.resourceType === type &&
                        grant.resourceId === row.resourceId,
                    );
                    const impliedRead =
                      rowGrants.length > 0 &&
                      !rowGrants.some((grant) => grant.action === "read");
                    return (
                      <li
                        key={row.resourceId}
                        className="
                          flex flex-wrap items-center justify-between gap-2 py-2
                        "
                      >
                        <span className="min-w-0 text-sm text-mist-100">
                          {row.label}
                          <FlagText flag={row.flag} />
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {row.actions.map((action) => {
                            const grant = findResourceGrant(
                              type,
                              row.resourceId,
                              action,
                            );
                            const implied =
                              action === "read" && !grant && impliedRead;
                            const busy = pending.has(
                              `${type}:${row.resourceId}:${action}`,
                            );
                            const actionLabel = ACTION_LABELS[action] ?? action;
                            const canGrant = !row.flag;
                            return (
                              <button
                                key={action}
                                type="button"
                                aria-pressed={Boolean(grant) || implied}
                                aria-label={`${actionLabel} ${row.label}`}
                                title={
                                  implied
                                    ? "Incluído por outra permissão"
                                    : undefined
                                }
                                disabled={
                                  busy || implied || (!grant && !canGrant)
                                }
                                onClick={() =>
                                  void (grant
                                    ? removeResourceGrants([grant])
                                    : addResourceGrants([
                                        {
                                          resourceType: type,
                                          resourceId: row.resourceId,
                                          action,
                                        },
                                      ]))
                                }
                                className={`
                                  cursor-pointer rounded-full border px-3 py-1
                                  text-xs transition-colors
                                  disabled:cursor-not-allowed
                                  ${busy ? "opacity-50" : ""}
                                  ${
                                    grant
                                      ? "border-blue-500 bg-blue-900 text-white"
                                      : implied
                                        ? `
                                          border-dashed border-blue-500
                                          text-blue-200
                                        `
                                        : `
                                          border-gray-600 text-mist-400
                                          hover:bg-gray-700
                                        `
                                  }
                                `}
                              >
                                {actionLabel}
                              </button>
                            );
                          })}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {[...routeGroups.entries()].map(([tag, tagRoutes]) => {
            const visible = tagRoutes.filter((route) =>
              matchesSearch(search, route.summary, route.key, tag),
            );
            if (visible.length === 0) return null;
            const granted = tagRoutes.filter((route) =>
              routeGrantByKey.has(route.key),
            ).length;
            const toGrant = visible
              .filter((route) => !routeGrantByKey.has(route.key))
              .map((route) => route.key);
            const toRevoke = visible
              .map((route) => routeGrantByKey.get(route.key))
              .filter((grant): grant is RouteGrant => Boolean(grant));
            return (
              <section
                key={tag}
                aria-label={tag}
                className="rounded-lg bg-gray-800 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h2 className="flex-1 text-sm text-mist-200">
                    {tag}{" "}
                    <span className="text-mist-400">
                      ({granted}/{tagRoutes.length})
                    </span>
                  </h2>
                  <Button
                    variant="secondary"
                    disabled={toGrant.length === 0}
                    onClick={() => void addRouteGrants(toGrant)}
                  >
                    Liberar todas
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={toRevoke.length === 0}
                    onClick={() => void removeRouteGrants(toRevoke)}
                  >
                    Remover todas
                  </Button>
                </div>
                <ul className="flex flex-col divide-y divide-gray-700">
                  {visible.map((route) => {
                    const grant = routeGrantByKey.get(route.key);
                    return (
                      <li
                        key={route.key}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-sm text-mist-100">
                            {route.summary}
                          </span>
                          <span className="
                            flex items-center gap-2 text-xs text-mist-400
                          ">
                            <span
                              className={`
                                rounded-sm px-1.5 font-mono text-[10px]
                                ${METHOD_COLORS[route.method] ?? "bg-gray-700"}
                              `}
                            >
                              {route.method}
                            </span>
                            <span className="truncate font-mono">
                              {route.path}
                            </span>
                          </span>
                        </div>
                        <Switch
                          checked={Boolean(grant)}
                          disabled={pending.has(`route:${route.key}`)}
                          onChange={() =>
                            void (grant
                              ? removeRouteGrants([grant])
                              : addRouteGrants([route.key]))
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {orphanRouteGrants.length > 0 && (
            <section
              aria-label="Rotas órfãs"
              className="rounded-lg bg-gray-800 p-3"
            >
              <h2 className="mb-2 text-sm text-mist-200">Rotas órfãs</h2>
              <ul className="flex flex-col divide-y divide-gray-700">
                {orphanRouteGrants.map((grant) => (
                  <li
                    key={grant.id}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <span className="font-mono text-xs text-mist-100">
                      {grant.routeKey}
                      <FlagText flag={STATUS_FLAGS[grant.status]} />
                    </span>
                    <Button
                      variant="secondary"
                      onClick={() => void removeRouteGrants([grant])}
                    >
                      Remover
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export const permissionsDashboard: DashboardData = {
  id: "permissions",
  content: PermissionsDashboard,
  icon: KeyIcon,
  name: "Permissões",
};
