# Integra — AGENTS.md

Event-driven daemon connecting external services (HTTP, MQTT, Home Assistant, Redis,
PostgreSQL, Email/IMAP, Cron) to user scripts. Every execution is auto-traced to MongoDB.

## Commands

| Command | Action |
|---------|--------|
| `bun run dev` | Start with `--watch` (HMR) |
| `bun run start` | Start production |
| `bun run lint` | ESLint (tseslint + prettier) |
| `bun run format` | Prettier check (`--check`) |
| `bun run format:fix` | Prettier write |

No tests exist yet. No typecheck script (tsc is `noEmit`, errors surface via IDE/ESLint).

## CLI flags (runtime)

`bun run src/index.ts --only-run=<triggerId> --debug`

- `--only-run` repeatable — skips triggers whose `id` does not match
- `--debug` — enables `console.debug` (suppressed by default)

## Architecture

**Entrypoint**: `src/index.ts` → `registerTriggers()` in `src/triggers/index.ts`

This is a daemon, not a library. It registers zero or more triggers, then starts
all six service clients unconditionally (each is a no-op if no subscriptions exist):

```
HTTP (Elysia) | MQTT | Home Assistant WS | Redis Pub/Sub | Postgres polling | Email IMAP
```

Triggers live in `src/scripts/<service>/<name>/`. Each exports a `Trigger` object
(`{ id, register() }`) created via one of the factory functions in `src/triggers/`.

## Conventions

- **Imports**: bare specifiers from `src/` (tsconfig `baseUrl: "src"`)
  - e.g. `import onHttp from "triggers/http"` not `../triggers/http`
- **HTTP triggers**: must use `TypedElysia()` from `triggers/http/types`, not raw `new Elysia()`.
  The typed variant adds `traceId` (UUID) and `triggerId` decorators.
- **Validation**: Zod (v4) for request bodies (`package.json`: `"zod": "^4.4.3"`)
- **Formatting**: tabWidth 4, singleQuote false, trailingComma all, printWidth 100
- **ESLint**: unused vars error (prefix with `_`); empty object type allowed with single extends
- **No `console.log` for data**: use `addTracerEvent()` for structured logging to MongoDB
- **Commits**: GPG-signed (key `1D4BCCE25E8EFD85`, user `git@gui.dev.br`)

## Gotchas

- `.env` is gitignored; `safeEnvGet()` throws at module import if a variable is missing.
  Every trigger module will fail fast if its required env var is absent.
- MongoDB (`MONGO_LOGS`) is required at startup — the instrumentation layer connects
  eagerly on import in `src/instrumentation/mongo.ts`.
- `instumentableFetch(traceId, ...)` wraps `fetch()` to log request/response as a trace
  event. Use it instead of raw `fetch()` inside trigger callbacks.

## Skills

ElysiaJS skill installed at `.agents/skills/elysiajs/`. Run `bunx skills` to list.