import {
  authz,
  currentUser,
  listUserResourceGrants,
  listUserRouteGrantKeys,
} from "@server/shared/authz";

import Elysia, { status } from "elysia";

import { resourceGrantBody, routeGrantBody } from "./model";
import {
  createResourceGrant,
  createRouteGrant,
  deleteResourceGrant,
  deleteRouteGrant,
  deleteUser,
  getUser,
  listResources,
  listRoutes,
  listUserGrants,
  listUsers,
} from "./service";

const NOT_FOUND_USER = { error: "User not found" };
const LAST_MANAGER = { error: "Cannot remove the last permission manager" };

export const meRoutes = new Elysia()
  .use(authz)
  .get(
    "/api/me",
    async (ctx) => {
      const user = currentUser(ctx);
      const [routes, resources] = await Promise.all([
        listUserRouteGrantKeys(user.id),
        listUserResourceGrants(user.id),
      ]);
      return {
        uid: user.uid,
        username: user.username,
        name: user.name,
        routes,
        resources,
      };
    },
    {
      detail: {
        tags: ["Permissions"],
        summary: "Current User",
        description:
          "Returns the identified user and their stored route and resource grants. " +
          "A non-read action also satisfies a read check, evaluated client-side.",
      },
    },
  );

export const permissionsRoutes = new Elysia({
  prefix: "/api/permissions",
  detail: { tags: ["Permissions"] },
})
  .use(authz)
  .get(
    "/users",
    () => listUsers(),
    {
      detail: {
        summary: "List Users",
        description: "Lists every user seen by the server, sorted by username.",
      },
    },
  )
  .get(
    "/users/:id/grants",
    async ({ params }) => {
      const user = await getUser(params.id);
      if (!user) return status(404, NOT_FOUND_USER);
      return listUserGrants(params.id);
    },
    {
      detail: {
        summary: "User Grants",
        description:
          "Lists a user's route and resource grants with their status " +
          "(ok, orphaned or unverified).",
      },
    },
  )
  .delete(
    "/users/:id",
    async ({ params }) => {
      const result = await deleteUser(params.id);
      if (result === "not_found") return status(404, NOT_FOUND_USER);
      if (result === "last_manager") return status(409, LAST_MANAGER);
      return { ok: true };
    },
    {
      detail: {
        summary: "Delete User",
        description:
          "Deletes a user; their grants cascade. Recreated with zero grants " +
          "on their next request.",
      },
    },
  )
  .post(
    "/users/:id/route-grants",
    async ({ params, body }) => {
      const result = await createRouteGrant(params.id, body.routeKey);
      if (result.kind === "user_not_found") return status(404, NOT_FOUND_USER);
      if (result.kind === "unknown_route")
        return status(400, { error: "Unknown route" });
      return result.kind === "created"
        ? status(201, result.grant)
        : status(200, result.grant);
    },
    {
      body: routeGrantBody,
      detail: {
        summary: "Grant Route",
        description:
          "Grants a user access to one route. Duplicate grants are idempotent.",
      },
    },
  )
  .delete(
    "/route-grants/:grantId",
    async ({ params }) => {
      const result = await deleteRouteGrant(params.grantId);
      if (result === "not_found")
        return status(404, { error: "Grant not found" });
      if (result === "last_manager") return status(409, LAST_MANAGER);
      return { ok: true };
    },
    {
      detail: {
        summary: "Revoke Route Grant",
        description: "Removes a route grant.",
      },
    },
  )
  .post(
    "/users/:id/resource-grants",
    async ({ params, body }) => {
      const result = await createResourceGrant(
        params.id,
        body.resourceType,
        body.resourceId,
        body.action,
      );
      if (result.kind === "user_not_found") return status(404, NOT_FOUND_USER);
      if (result.kind === "invalid_action")
        return status(400, { error: "Invalid action for resource type" });
      if (result.kind === "unknown_resource")
        return status(400, { error: "Unknown resource" });
      if (result.kind === "frigate_unavailable")
        return status(502, { error: "Frigate indisponível" });
      return result.kind === "created"
        ? status(201, result.grant)
        : status(200, result.grant);
    },
    {
      body: resourceGrantBody,
      detail: {
        summary: "Grant Resource",
        description:
          "Grants a user an action on a Tuya resource, Frigate camera or cron job.",
      },
    },
  )
  .delete(
    "/resource-grants/:grantId",
    async ({ params }) => {
      const result = await deleteResourceGrant(params.grantId);
      if (result === "not_found")
        return status(404, { error: "Grant not found" });
      return { ok: true };
    },
    {
      detail: {
        summary: "Revoke Resource Grant",
        description: "Removes a resource grant.",
      },
    },
  )
  .get("/routes", () => listRoutes(), {
    detail: {
      summary: "List Routes",
      description:
        "Lists every guarded route for the permission picker, grouped by tag.",
    },
  })
  .get("/resources", () => listResources(), {
    detail: {
      summary: "List Resources",
      description:
        "Lists grantable Tuya resources, cron jobs and Frigate cameras.",
    },
  });
