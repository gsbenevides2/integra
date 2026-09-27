# Modules

What the old repo called a "script" (business logic under `src/extensions/scripts/<service>/<name>/`) is called a **module** here, and lives under `server/modules/<domain>/`. The shape is more structured — a fixed `model.ts`/`service/`/`jobs/`/`index.ts` split instead of a loose `types.ts`/`utils.ts`/`routes.ts`/`cron.ts` bag — but the idea is the same: one folder per integration, containing everything it needs.

## Example: Authentik Login Failed

File: `server/modules/authentik/`

This module listens for an HTTP POST from **Authentik** (the SSO provider) when a login attempt fails, and sends a formatted Discord notification. It's the simplest kind of module: no database table, no cron job, no dashboard — just a route and a service function.

### Structure

```text
server/modules/authentik/
├── model.ts            # Zod schema for the inbound webhook body
├── service/message.ts   # generateMessage() — parses the payload, formats a Discord message
└── index.ts             # Elysia route: POST /api/authentik/login-failed
```

### How It Works

1. Authentik sends a POST to `/api/authentik/login-failed` with login attempt details.
2. Elysia validates the body against `loginFailedBody` (Zod) before the handler even runs.
3. `generateMessage()` parses Authentik's payload (a Python-dict-repr string embedded in one field) and formats a Discord message.
4. The message is sent via `sendDiscordMessage()` (`server/shared/discord.ts`).
5. The span the request already has (from `elysiaOtel`) records the outcome — no manual logging call needed.

### Creating a New Module

1. Create `server/modules/<domain>/`.
2. `model.ts` — Zod schemas for anything the module validates, plus shared types/consts.
3. `service/*.ts` — one `abstract class` per concern, `static` methods, doing the actual work (DB access, external API calls).
4. If it needs routes: `index.ts` — a plain `new Elysia({ prefix: "/api/<domain>", detail: { tags: [...] } })`, then in `server/index.ts`: one import + one `.use(xRoutes)`.
5. If it needs a scheduled job: `jobs/<name>.ts` — a plain exported `async function`, then in `server/cron.ts`: one import + one `Bun.cron(...)` line inside `registerCrons()`.
6. If it has a DB table: `server/db/<domain>.ts` (own `pgSchema`), then `export * from "./<domain>"` in `server/db/schema.ts`.
7. If it needs a dashboard: `public/dashboards/<domain>/`, then one import + one entry in `DASHBOARD_LIST` (`public/components/GlobalDrawerContext/index.tsx`).

A module only needs the pieces it actually uses — `birthday` has no `index.ts`/routes/DB/dashboard at all, just a `jobs/` function scheduled from `server/cron.ts`.

See [`development.md`](./development.md) for the full checklist and verification steps.
