import React, { useCallback, useEffect, useState } from "react";

import { MANAGER_ROUTE_KEY } from "@server/modules/permissions/constants";
import { Button } from "@public/components/Button";
import { useConfirm } from "@public/components/ConfirmContext";
import {
  DashboardData,
  useGlobalDrawer,
} from "@public/components/GlobalDrawerContext";
import { IconButton } from "@public/components/IconButton";
import { useMe } from "@public/components/MeContext";
import { Select } from "@public/components/Select";
import { useToast } from "@public/components/Toast";

import { Bars3Icon, KeyIcon, UserGroupIcon } from "@heroicons/react/24/outline";

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

export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  tuya_device: "Dispositivos Tuya",
  tuya_sensor: "Sensores Tuya",
  tuya_preset: "Modos Tuya",
  frigate_camera: "Câmeras",
  cron_job: "Crons",
};

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

/** Every non-read action implies read, so a lone write/execute/apply is worth explaining. */
export function showsImpliedRead(
  grant: ResourceGrant,
  all: ResourceGrant[],
): boolean {
  if (grant.action === "read") return false;
  return !all.some(
    (other) =>
      other.resourceType === grant.resourceType &&
      other.resourceId === grant.resourceId &&
      other.action === "read",
  );
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
  const [routeToAdd, setRouteToAdd] = useState("");
  const [resourceToAdd, setResourceToAdd] = useState("");
  const [actionToAdd, setActionToAdd] = useState("");

  const selectedUser = users.find((user) => user.id === selectedUserId);

  const fetchGrants = useCallback(async (userId: string) => {
    if (!userId) {
      setGrants({ routes: [], resources: [] });
      return;
    }
    const { data } = await getPermissionsEdenClient()
      .api.permissions.users({ id: userId })
      .grants.get();
    if (data) setGrants(data as unknown as Grants);
  }, []);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    const client = getPermissionsEdenClient();
    const [usersRes, routesRes, resourcesRes] = await Promise.all([
      client.api.permissions.users.get(),
      client.api.permissions.routes.get(),
      client.api.permissions.resources.get(),
    ]);
    if (usersRes.data) setUsers(usersRes.data as unknown as UserRow[]);
    if (routesRes.data) setRoutes(routesRes.data as unknown as RouteOption[]);
    if (resourcesRes.data) {
      const payload = resourcesRes.data as unknown as {
        resources: ResourceOption[];
        frigateAvailable: boolean;
      };
      setResources(payload.resources ?? []);
      setFrigateAvailable(payload.frigateAvailable ?? true);
    }
    setIsLoading(false);
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

  const addRouteGrant = async () => {
    if (!selectedUserId || !routeToAdd) return;
    const { error } = await getPermissionsEdenClient()
      .api.permissions.users({ id: selectedUserId })
      ["route-grants"].post({ routeKey: routeToAdd });
    if (error) {
      showToast(errorText(error, "Falha ao conceder rota"), "error");
      return;
    }
    setRouteToAdd("");
    showToast("Permissão de rota concedida", "success");
    await fetchGrants(selectedUserId);
  };

  const selectedResource = resources.find(
    (resource) =>
      `${resource.resourceType}:${resource.resourceId}` === resourceToAdd,
  );

  const addResourceGrant = async () => {
    if (!selectedUserId || !selectedResource || !actionToAdd) return;
    const { error } = await getPermissionsEdenClient()
      .api.permissions.users({ id: selectedUserId })
      ["resource-grants"].post({
        resourceType: selectedResource.resourceType as never,
        resourceId: selectedResource.resourceId,
        action: actionToAdd as never,
      });
    if (error) {
      showToast(errorText(error, "Falha ao conceder recurso"), "error");
      return;
    }
    setResourceToAdd("");
    setActionToAdd("");
    showToast("Permissão de recurso concedida", "success");
    await fetchGrants(selectedUserId);
  };

  const removeRouteGrant = async (grant: RouteGrant) => {
    const isOwnManagementGrant =
      grant.routeKey === MANAGER_ROUTE_KEY && selectedUser?.uid === me?.uid;
    if (isOwnManagementGrant) {
      const ok = await confirm({
        message:
          "Remover sua própria permissão de gerenciamento? Você pode ficar sem acesso para restaurá-la.",
      });
      if (!ok) return;
    }
    const { error } = await getPermissionsEdenClient()
      .api.permissions["route-grants"]({ grantId: grant.id })
      .delete();
    if (error) {
      showToast(errorText(error, "Falha ao remover permissão"), "error");
      return;
    }
    showToast("Permissão removida", "success");
    await fetchGrants(selectedUserId);
  };

  const removeResourceGrant = async (grant: ResourceGrant) => {
    const { error } = await getPermissionsEdenClient()
      .api.permissions["resource-grants"]({ grantId: grant.id })
      .delete();
    if (error) {
      showToast(errorText(error, "Falha ao remover permissão"), "error");
      return;
    }
    showToast("Permissão removida", "success");
    await fetchGrants(selectedUserId);
  };

  const routesByTag = new Map<string, RouteGrant[]>();
  for (const grant of grants.routes) {
    const tag = routes.find((route) => route.key === grant.routeKey)?.tag ?? "—";
    routesByTag.set(tag, [...(routesByTag.get(tag) ?? []), grant]);
  }

  const resourcesByType = new Map<string, ResourceGrant[]>();
  for (const grant of grants.resources) {
    resourcesByType.set(grant.resourceType, [
      ...(resourcesByType.get(grant.resourceType) ?? []),
      grant,
    ]);
  }

  const routeGroups = new Map<string, RouteOption[]>();
  for (const route of routes) {
    routeGroups.set(route.tag, [...(routeGroups.get(route.tag) ?? []), route]);
  }

  const isManager =
    selectedUser !== undefined &&
    grants.routes.some((grant) => grant.routeKey === MANAGER_ROUTE_KEY);

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center gap-2">
        <IconButton
          onClick={() => globalDrawer.setIsOpen(true)}
          aria-label="Abrir menu"
        >
          <Bars3Icon className="size-5" />
        </IconButton>
        <h1 className="text-xl">Permissões</h1>
      </div>

      {isLoading ? (
        <p className="text-sm text-mist-400">Carregando permissões...</p>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <UserGroupIcon className="size-10 text-mist-500" />
          <p className="text-mist-200">Nenhum usuário registrado</p>
        </div>
      ) : (
        <>
          <Select
            id="user"
            label="Usuário"
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            options={users.map((user) => ({
              label: user.username,
              value: user.id,
            }))}
          />

          {selectedUser && (
            <div className="flex flex-col gap-1 text-xs text-mist-400">
              <span>uid: {selectedUser.uid}</span>
              {isManager && (
                <span className="text-green-300">Gerenciador de permissões</span>
              )}
            </div>
          )}

          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-64 flex-1">
                <label className="text-xs text-mist-300" htmlFor="route">
                  Rota
                </label>
                <select
                  id="route"
                  value={routeToAdd}
                  onChange={(event) => setRouteToAdd(event.target.value)}
                  className="
                    w-full rounded-md border border-mist-600 bg-gray-900 p-2
                  "
                >
                  <option value="">Selecione uma rota</option>
                  {[...routeGroups.entries()].map(([tag, tagRoutes]) => (
                    <optgroup key={tag} label={tag}>
                      {tagRoutes.map((route) => (
                        <option key={route.key} value={route.key}>
                          {route.summary} ({route.key})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <Button onClick={() => void addRouteGrant()}>Adicionar</Button>
            </div>

            {[...routesByTag.entries()].map(([tag, tagGrants]) => (
              <div key={tag} className="rounded-md bg-gray-800 p-3">
                <h2 className="mb-2 text-sm text-mist-300">{tag}</h2>
                <ul className="flex flex-col gap-1">
                  {tagGrants.map((grant) => (
                    <li
                      key={grant.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-sm text-mist-100">
                        {grant.routeKey}
                        {grant.status !== "ok" && (
                          <span className="ml-2 text-xs text-yellow-300">
                            ({STATUS_FLAGS[grant.status]})
                          </span>
                        )}
                      </span>
                      <Button
                        variant="secondary"
                        onClick={() => void removeRouteGrant(grant)}
                      >
                        Remover
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-64 flex-1">
                <label className="text-xs text-mist-300" htmlFor="resource">
                  Recurso
                </label>
                <select
                  id="resource"
                  value={resourceToAdd}
                  onChange={(event) => {
                    setResourceToAdd(event.target.value);
                    const resource = resources.find(
                      (item) =>
                        `${item.resourceType}:${item.resourceId}` ===
                        event.target.value,
                    );
                    setActionToAdd(resource?.actions[0] ?? "");
                  }}
                  className="
                    w-full rounded-md border border-mist-600 bg-gray-900 p-2
                  "
                >
                  <option value="">Selecione um recurso</option>
                  {resources.map((resource) => (
                    <option
                      key={`${resource.resourceType}:${resource.resourceId}`}
                      value={`${resource.resourceType}:${resource.resourceId}`}
                    >
                      {RESOURCE_TYPE_LABELS[resource.resourceType]}:{" "}
                      {resource.label}
                    </option>
                  ))}
                </select>
              </div>
              {selectedResource && (
                <div className="min-w-40">
                  <Select
                    id="action"
                    label="Ação"
                    value={actionToAdd}
                    onChange={(event) => setActionToAdd(event.target.value)}
                    options={selectedResource.actions.map((action) => ({
                      label: ACTION_LABELS[action] ?? action,
                      value: action,
                    }))}
                  />
                </div>
              )}
              <Button onClick={() => void addResourceGrant()}>Adicionar</Button>
            </div>

            {!frigateAvailable && (
              <p className="text-xs text-yellow-300">
                Frigate indisponível: câmeras não verificadas.
              </p>
            )}

            {[...resourcesByType.entries()].map(([type, typeGrants]) => (
              <div key={type} className="rounded-md bg-gray-800 p-3">
                <h2 className="mb-2 text-sm text-mist-300">
                  {RESOURCE_TYPE_LABELS[type] ?? type}
                </h2>
                <ul className="flex flex-col gap-1">
                  {typeGrants.map((grant) => (
                    <li
                      key={grant.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-sm text-mist-100">
                        {grant.label ?? grant.resourceId} —{" "}
                        {ACTION_LABELS[grant.action] ?? grant.action}
                        {showsImpliedRead(grant, grants.resources) && (
                          <span className="ml-2 text-xs text-mist-400">
                            (inclui leitura)
                          </span>
                        )}
                        {grant.status !== "ok" && (
                          <span className="ml-2 text-xs text-yellow-300">
                            ({STATUS_FLAGS[grant.status]})
                          </span>
                        )}
                      </span>
                      <Button
                        variant="secondary"
                        onClick={() => void removeResourceGrant(grant)}
                      >
                        Remover
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </>
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
