# Development Workflow

A playbook for adding a feature or fixing a bug in this repo, whatever module it touches (Tuya, TP-Link, Google, train status, ...). It is not about any specific integration — it is about how this codebase wants to be extended.

## Checklist

1. Find the closest existing module and mirror its shape — don't invent new structure.
2. Extend a module's existing `model.ts`/`service/`/`index.ts` instead of starting new ones, unless the feature genuinely doesn't fit any existing module.
3. Keep code identifiers in English, UI copy in Portuguese (pt-BR) — matches every existing screen.
4. Reuse `public/components/*` and `server/shared/*` before writing new helpers.
5. Run `bun run lint` and a `bunx tsc --noEmit` pass. No test suite exists — actually run the app and drive the change (curl the route, click through the UI) instead of trusting types alone.
6. Never let a cron you're testing run unattended in dev — see [Safety](#safety-real-hardware-a-shared-database-and-crons) below.
7. Only commit when the user asks for it.

## 1. Explore before you build

This repo already has a full example for almost any shape of feature: a cloud-backed CRUD entity with real-time push (`tuya` devices/sensors via Pulsar), a scheduled poll-and-store job (`train-status`, `status-platform`, `server-metrics`), a stateful sync engine talking to real hardware (`tplink`), a stateless webhook (`authentik`), a cron-only job with no routes or UI at all (`birthday`).

- Grep for the closest analog by shape, not by domain. A new scheduled external-API poller looks like `train-status` or `status-platform`, not like `tplink`, even if it happens to also be about networking.
- Read that example end to end: `server/db/<domain>.ts` → `service/*.ts` → `index.ts` → `public/dashboards/<domain>/`. Note exactly which files it touches and copy that shape.
- Prefer the smaller/leaner analog when the new feature is simpler — don't drag in machinery (a circuit breaker, a sync engine, a websocket) the new feature doesn't need.

If nothing in the repo is close, that's a signal to ask the user how they want it structured before committing to a design.

## 2. Database changes

- ORM is Drizzle over PostgreSQL, **schema-push, no migration files**. Edit `server/db/<domain>.ts` and run `bun run db:sync` (wraps `drizzle-kit push`) — there is nothing to write in a `migrations/` folder.
- One `pgSchema("<domain>")` per module, in its own file. `server/db/schema.ts` re-exports every domain file with `export * from "./<domain>"` — a new table needs no wiring beyond being exported from its domain file.
- Match the column conventions already in use: `id: text().primaryKey().$defaultFn(() => crypto.randomUUID())`, `createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()`. Only add `updatedAt`/soft-delete flags (`hidden`) if the feature actually needs them.
- **If the tables already exist in the live database** (a schema shared with another app, or one you're deliberately not altering), match the existing column names/types exactly and skip `db:sync` entirely — pushing against a schema that already matches is a needless risk, not a needless no-op.

## 3. Service layer

Lives in `server/modules/<domain>/service/*.ts`, one file per concern, as `static` methods on an `abstract class` (no instantiation, no repository interfaces):

- `list()`, `get(id)`, `getOrThrow(id)`, `create(input)`, `update(id, partialInput)`, `delete(id)`.
- `update` uses a diff pattern: build a `changes` object from only the fields present on the partial input, skip the DB call entirely if nothing changed.
- Business actions (e.g. "apply this saved preset to a live device") are separate methods that compose the CRUD primitives with whatever the domain's action primitive already is (e.g. `DeviceService.command()` for Tuya) — never reimplement the action primitive itself.
- Wrap anything worth tracing individually (an SSH call, a call to an external API without a descriptive URL) in an OpenTelemetry span — see `server/shared/ssh.ts` for the pattern. Plain outgoing `fetch()` calls and DB queries are already auto-traced; don't add a manual span around those.

## 4. HTTP routes

- One `new Elysia({ prefix: "/api/<domain>", detail: { tags: [...] } })` instance per module (`server/modules/<domain>/index.ts`) — no wrapper needed, OTEL instrumentation is automatic for every mounted route.
- Every route gets `detail: { summary, description }` — this is what shows up in the OpenAPI/Scalar docs, there's no separate documentation step.
- Validate bodies/queries with Zod (v4) schemas from `model.ts`, with `.meta({ title, description, example })` so the OpenAPI docs stay useful.
- Mirror the existing error handling: 404 (`status(404, {...})`) when a referenced row doesn't exist, 503 with the caught message around a call to an external service that might fail.
- One Eden Treaty client per module (`public/dashboards/<domain>/client.ts`, `treaty<typeof xRoutes>("", { keepDomain: true })`) — the frontend gets new endpoints for free through the existing typed client, no manual fetch/URL building.

## 5. Dashboard UI

- One entry per module in `public/dashboards/<domain>/`, registered by adding one import and one `DASHBOARD_LIST` entry in `public/components/GlobalDrawerContext/index.tsx` — that's the only registration point, there's no separate dashboard-index file.
- Reuse `public/components/*` as-is: `Modal`, `Drawer`, `Input`, `Select`, `Slider`, `RingPicker`, `Switch`, `Button`, `IconButton`, `useToast` (`ToastContext`), `useConfirm` (`ConfirmContext`). Don't write new primitives for something these already cover.
- Follow the create/list/edit split already used everywhere: a form (often wrapped in `Modal`) for creation, a `<Entity>Card` for the grid, a `<Entity>DrawerContent` (wrapping `Drawer`) for edit + delete — delete always behind `useConfirm()`.
- There is no auth/user-scoping anywhere in this app (single-user home daemon) — don't add per-user scoping to a new entity unless explicitly asked.

## 6. Naming & language

- Code identifiers (types, table/column names, function names, file names) are always English.
- UI-visible text is always Portuguese (pt-BR) — a label like `kind: "lamp"` renders as "Lâmpada".
- Watch for collisions between a new concept's name and a value a lower layer already uses for something else (e.g. Tuya's own `workMode: "scene"` is unrelated to an app-level "preset" feature) — pick a code identifier that doesn't collide.

## 7. Verification

There is no automated test suite in this repo. Treat these as the equivalent:

- `bun run lint` (or `lint:fix`) on every changed file.
- `bunx tsc --noEmit` for a full typecheck.
- Actually run the change:
  - Backend-only change: `curl` the new/changed route(s) directly.
  - UI change: `bun run dev` already watches and rebuilds the frontend; drive the page (Playwright or a real browser) through the golden path and at least one edge case (empty state, a validation error, a 404).
- Before declaring a UI or route change done, confirm it in the running app, not just in the type checker.

## Safety: real hardware, a shared database, and crons

This daemon controls real devices (a router, smart-home devices), talks to a shared Postgres instance, and its cron jobs hit real external services on a schedule.

- **`bun run dev` disables cron jobs by default** (`server/cron.ts`, gated on `NODE_ENV`/`ENABLE_CRONS`) — leave it that way. Set `ENABLE_CRONS=true` only when you deliberately want to exercise one job locally, and expect it to actually hit the real router/SSH box/Discord channel/etc. when you do.
- **Never trigger an action with a real-world side effect** (sending a command to a physical device, sending a Discord notification, posting to an external API) while testing, unless the user explicitly asks you to verify that specific action.
- **Ask before running `bun run db:sync`** against the shared Postgres instance, even for an additive, non-destructive change.
- Prefer read-only checks (`curl` a GET route, read a table via `db:studio`) over the corresponding write action whenever a read-only check answers the same question.
