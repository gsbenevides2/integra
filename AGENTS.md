# Integra — AGENTS.md

Event-driven daemon connecting external services (HTTP, MQTT, Redis, PostgreSQL, Email/IMAP, Cron) to user scripts. Every execution is auto-traced to PostgreSQL. Full React dashboard UI for viewing logs.

## Commands

| Command | Action |
|---------|--------|
| `bun run dev` | Start dev mode: Tailwind watch + Elysia HMR + React build watch |
| `bun run start` | Start production daemon |
| `bun run lint` | ESLint check |
| `bun run lint:fix` | ESLint fix + format |
| `bun run format` | Prettier check |
| `bun run format:fix` | Prettier write |
| `bun run db:sync` | Push Drizzle schema to PostgreSQL |
| `bun run db:studio` | Open Drizzle Studio UI |

No tests exist yet. No typecheck script (tsc is `noEmit`, errors surface via IDE/ESLint).

## CLI flags (runtime)

`bun run src/index.ts --only-run=<triggerId> --debug`

- `--only-run` repeatable — skips triggers whose `id` does not match
- `--debug` — enables `console.debug` (suppressed by default)

## Architecture

**Entrypoint**: `src/index.ts` → `registerSettings()` in `src/core/index.ts`

This is a daemon, not a library. It registers zero or more triggers, then starts all six service clients unconditionally (each is a no-op if no subscriptions exist):

```
HTTP (Elysia) | MQTT | Redis Pub/Sub | Postgres polling | Email IMAP | Cron
```

**Database**: PostgreSQL (Drizzle ORM) stores all execution traces in `runs` and `run_events` tables

**UI**: React dashboard served via HTTP (Elysia) for viewing logs and managing integrations

Triggers live in `src/extensions/scripts/<service>/<name>/`. Each exports a `Trigger` object (`{ id, register() }`) created via one of the factory functions in `src/core/triggers/`.

## Conventions

- **Imports**: bare specifiers from `src/` (tsconfig `baseUrl: "src"`)
  - e.g. `import onHttp from "core/triggers/http"` not `../core/triggers/http`
- **HTTP triggers**: must use `TypedElysia()` from `core/triggers/http/types`, not raw `new Elysia()`.
  The typed variant adds `traceId` (UUID) and `triggerId` decorators.
- **Validation**: Zod (v4) for request bodies and CLI arguments
- **Formatting**: tabWidth 4, singleQuote false, trailingComma all, printWidth 100
- **ESLint**: unused vars error (prefix with `_`); empty object type allowed with single extends
- **Logging**: `addTracerEvent()` for structured tracing to PostgreSQL (never `console.log` for data)
- **Instrumentation**: Every trigger execution receives `traceId` (UUID) propagated through all logs
- **Commits**: GPG-signed (key `1D4BCCE25E8EFD85`, user `git@gui.dev.br`)

## Gotchas

- `.env` is gitignored; `safeEnvGet()` throws at module import if a variable is missing.
  Every trigger module will fail fast if its required env var is absent.
- PostgreSQL connection must be available at startup — the instrumentation layer initializes
  in `src/core/index.ts`. The daemon will exit if the connection fails.
- `instrumentableFetch(traceId, ...)` wraps `fetch()` to log request/response as a trace
  event. Use it instead of raw `fetch()` inside trigger callbacks.
- **CLI flags**: Use `--disableCrons` in dev mode (`bun run dev:server --disableCrons`) to skip cron triggers

## Skills

ElysiaJS skill installed at `.agents/skills/elysiajs/`. Run `bunx skills` to list.

## Adding a feature or fixing a bug

Read [`docs/development.md`](docs/development.md) first — it's a domain-agnostic playbook (DB, routes, dashboard UI, naming, verification, versioning/commits, and safety around real hardware + the shared database) for extending this codebase, distilled from how existing features here are actually built.