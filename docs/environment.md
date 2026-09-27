# Environment

## Requirements

- **Bun** (see `bunfig.toml`/`package.json` for the toolchain; no Node.js involved anywhere)
- **PostgreSQL** — application data, one schema per module
- **Redis** — caching (`server/shared/cache.ts`), read via Bun's built-in client

## Quick Start

```bash
# Install dependencies
bun install

# Configure
cp .env .env.local
# Edit .env.local — see docs/configuration.md for the full variable reference

# Run in development (HMR via --watch; cron jobs disabled by default)
bun run dev

# Run in production (cron jobs enabled)
NODE_ENV=production bun run dev

# Test one cron job locally without enabling all of them
ENABLE_CRONS=true bun run dev
```

## Code Quality

```bash
bun run lint       # ESLint check
bun run lint:fix    # ESLint fix
```

There is no `format`/`format:fix` script and no automated test suite — see [`development.md`](./development.md) for how changes are verified instead (typecheck + actually running the app).

## Project Conventions

- **Runtime**: Bun only — no Node.js APIs assumed to work the same way, prefer Bun built-ins (`Bun.serve`, `Bun.cron`, `Bun.redis`, `Bun.s3`) over npm packages that reimplement them.
- **HTTP Framework**: Elysia.
- **Validation**: Zod v4.
- **Database**: PostgreSQL via Drizzle ORM, schema-push only (`bun run db:sync`) — no `migrations/` folder.
- **Module System**: ESM (`"type": "module"`).
- **Import Style**: path aliases `@server/*` and `@public/*` (see `tsconfig.json`), not bare `baseUrl` specifiers.
