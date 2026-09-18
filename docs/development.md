# Development Workflow

A playbook for adding a feature or fixing a bug in this repo, whatever service or domain it touches (Tuya, TP-Link, calendars, Google accounts, ...). It is not about any specific integration — it is about how this codebase wants to be extended.

## Checklist

1. Find the closest existing example and mirror it — don't invent new structure.
2. Extend the domain's existing schema/route/dashboard file instead of creating new ones, unless the domain doesn't have one yet.
3. Keep code identifiers in English, UI copy in Portuguese (pt-BR) — matches every existing screen.
4. Reuse `core/ui/components/*` and existing `utils/*` helpers before writing new ones.
5. Run `bun run lint`, `bun run format`, and a `tsc --noEmit` pass. No test suite exists — actually run the app and drive the change (curl the route, click through the UI) instead of trusting types alone.
6. Bump `package.json`'s patch version and commit with a `feat:`/`fix:` message, following the existing log.
7. Never touch a live device or the shared Postgres instance without telling the user first — see [Safety](#safety-real-hardware--a-shared-database).

## 1. Explore before you build

This repo already has a full CRUD example for almost any shape of feature you'll need: a registerable entity with cloud-backed state (`tuyaDevices`), a lighter read-mostly entity (`tuyaSensors`), a time-series log (`tuyaDeviceStateHistory`), a scheduled job (`onCron` triggers), a webhook consumer (`authentik/loginFailed`). Before writing anything:

- Grep for the closest analog by shape, not by domain. A new "preset"/"profile"/"saved config" entity looks like `tuyaDevices`, not like `tuyaSensors`, even though sensors live in the same folder.
- Read that example end to end: schema → access layer → routes → dashboard. Note exactly which files it touches and copy that shape.
- Prefer the smaller/leaner analog when the new entity is simpler (e.g. `tuyaSensors`' rename/enable/hide pattern) — don't drag in machinery (history tables, live polling) the new feature doesn't need.

If nothing in the repo is close, that's a signal to ask the user how they want it structured before committing to a design.

## 2. Database changes

- ORM is Drizzle over PostgreSQL, **schema-push, no migration files**. Edit `src/extensions/db/<domain>.ts` and run `bun run db:sync` (wraps `drizzle-kit push`) — there is nothing to write in a `migrations/` folder.
- Add a new table to the domain's existing schema file (e.g. everything Tuya-related lives in `src/extensions/db/tuya.ts` under one `pgSchema("tuya")`) rather than creating a one-table file. Only start a new file for a genuinely new domain.
- `src/extensions/db/schema.ts` re-exports every domain file with `export * from "./<domain>"` — a new table needs no wiring beyond being exported from its domain file.
- Match the column conventions already in use: `id: text().primaryKey().$defaultFn(() => crypto.randomUUID())`, `createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()`. Only add `updatedAt`/soft-delete flags (`hidden`) if the feature actually needs them — most entities here don't.

## 3. Service / access layer

Lives in `src/utils/<domain>/<entity>.ts`, one file per entity, plain async functions (no classes, no repository interfaces):

- `list<Entity>s()`, `get<Entity>(id)`, `get<Entity>OrThrow(id)`, `create<Entity>(input)`, `update<Entity>(id, partialInput)`, `delete<Entity>(id)`.
- `update` uses a diff pattern: build a `changes` object from only the fields present on the partial input, skip the DB call entirely if nothing changed.
- Business actions (e.g. "apply this saved config to a live device") are separate functions in the same file that compose the CRUD primitives with whatever the domain's action primitive already is (e.g. `commandDevice()` for Tuya) — never reimplement the action primitive itself.

## 4. HTTP routes

- The HTTP framework is Elysia, and every route must go through `TypedElysia()` (`core/triggers/http/types`) — never a raw `new Elysia()` — for the `traceId`/`triggerId` decorators.
- Each domain keeps **one** Elysia instance and **one** Eden Treaty client (e.g. `tuyaElysiaClient` / `getTuyaEdenClient()` in `src/extensions/scripts/<domain>/routes.ts` + `client.ts`). Add new endpoints to that instance instead of starting a second route file/client for the same domain — the frontend gets the new routes for free through the existing typed client.
- Validate bodies with Zod (v4), colocated above the route chain. Match the normalized value ranges the domain already established (e.g. this app always represents brightness/saturation as 0-100 percent and colour as `#rrggbb`, never the device's raw 0-255/0-1000 range) — conversion to raw device units belongs in the domain's existing conversion layer, not in a new one.
- Mirror the existing error handling: 404 when a referenced row doesn't exist, try/catch around any call to an external service returning a 503 with the caught message.

## 5. Dashboard UI

- The UI is a server-rendered React 19 + Tailwind SPA (`src/core/ui`), one entry per domain in `src/extensions/dashboards/<domain>/`, registered in `src/extensions/dashboards/index.ts`.
- A new entity in an existing domain is a new **section** inside that domain's dashboard (see how "Sensores" sits next to "Iluminação" in the Tuya dashboard), not a new sidebar item — only add a new `DashboardData` entry for a genuinely new domain.
- Reuse `core/ui/components/*` as-is: `Modal`, `Drawer`, `Input`, `Select`, `Slider`, `RingPicker`, `Switch`, `Button`, `useToast`, `useConfirm`. Don't write new primitives for something these already cover.
- Follow the create/list/edit split already used everywhere: a `New<Entity>Form` wrapping `Modal` for creation, an `<Entity>Card` for the grid, an `<Entity>DrawerContent` wrapping `Drawer` for edit + delete (delete always behind `useConfirm()`).
- There is no auth/user-scoping anywhere in this app (single-user home daemon) — don't add per-user scoping to a new entity unless explicitly asked; it would be the only place in the codebase doing it.

## 6. Naming & language

- Code identifiers (types, table/column names, function names, file names) are always English, matching every existing module.
- UI-visible text is always Portuguese (pt-BR), matching every existing screen — a label like `kind: "lamp"` renders as "Lâmpada".
- Watch for collisions between a new concept's name and a value a lower layer already uses for something else (e.g. Tuya's own `workMode: "scene"` is unrelated to an app-level "scene"/"preset" feature) — pick a code identifier that doesn't collide, and keep the Portuguese UI word separate from the English code word if that avoids the clash.

## 7. Verification

There is no automated test suite in this repo. Treat these as the equivalent:

- `bun run lint` and `bun run format` (or `lint:fix` / `format:fix`) on every changed file.
- `bunx tsc --noEmit` for a full typecheck — the dev loop otherwise only surfaces type errors through the IDE.
- Actually run the change:
  - Backend-only change: `curl` the new/changed route(s) directly.
  - UI change: rebuild the static assets (`bun run build:css && bun run build:client`) if the running dev server isn't also running the `dev:client`/`dev:css` watchers, then drive the page (Playwright or a real browser) through the golden path and at least one edge case (empty state, a validation error, a 404).
- Before declaring a UI or route change done, confirm it in the running app, not just in the type checker — see the [`run`](../.claude/skills) skill pattern: launch, then interact, then look at the result.

## 8. Versioning & commits

- Bump the patch version in `package.json` (`"version"`) with every feature/fix commit — check `git log` for the current pattern (`feat: ... and bump version to X.Y.Z` / `feat: ... and increment version to X.Y.Z`).
- Commit messages use a `feat:`/`fix:` prefix and describe the *why*, not a line-by-line *what*.
- Only commit when the user asks for it.

## Safety: real hardware & a shared database

This daemon controls real devices in the user's home and talks to a Postgres instance on their home network (`DATABASE_URL` points at `192.168.0.3`, not a disposable local DB) — it is not a sandboxed toy project.

- **Never trigger an action with a real-world side effect** (sending a command to a physical device, sending a notification, posting to an external API) while testing, unless the user explicitly asks you to verify that specific action. Cancel out of confirmation dialogs instead of confirming them when the only goal is checking that the dialog renders.
- **Ask before running `bun run db:sync`** or anything else that writes to the shared Postgres instance, even for an additive, non-destructive change — the user should always get the chance to say no first.
- Prefer read-only checks (`curl` a GET route, read a table via `db:studio`) over the corresponding write action whenever a read-only check answers the same question.
