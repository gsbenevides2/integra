# Integra

Modular event-driven integration platform built with **Bun** and **Elysia**. Connects external services (HTTP, MQTT, Home Assistant, Redis, PostgreSQL, Email/IMAP, Cron) and executes custom scripts in response to events — with full execution tracing to MongoDB.

## Features

- **6 trigger types**: HTTP (Elysia), MQTT, Home Assistant (WebSocket), Redis (Pub/Sub), PostgreSQL (Polling), Email (IMAP IDLE), and Cron
- **Automatic instrumentation**: Every execution is traced and logged to MongoDB
- **Modular scripts**: Business logic lives in `src/scripts/`, cleanly separated from infrastructure
- **Discord integration**: Built-in utility for sending Discord messages
- **Zod validation**: Request bodies validated at runtime
- **Debug & filter**: CLI flags for debug logging and trigger filtering

## Quick Start

```bash
# Install
bun install

# Configure
cp .env .env.local
# Edit .env.local with your credentials

# Run (development)
bun run dev

# Run (production)
bun run start

# Run with only specific triggers
bun run start --only-run=authentik:loginFailed --debug
```

## Documentation

See the [`docs/`](./docs/) folder for detailed documentation:

- [Architecture](./docs/architecture.md)
- [Triggers](./docs/triggers.md)
- [Instrumentation](./docs/instrumentation.md)
- [Scripts](./docs/scripts.md)
- [Utilities](./docs/utils.md)
- [Configuration](./docs/configuration.md)
- [Environment](./docs/environment.md)

## Scripts

| Command | Description |
|---------|-------------|
| `bun run start` | Start in production mode |
| `bun run dev` | Start with file watching (HMR) |
| `bun run lint` | Lint code with ESLint |
| `bun run lint:fix` | Lint and auto-fix |
| `bun run format` | Check formatting with Prettier |
| `bun run format:fix` | Format and write |

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **HTTP**: [Elysia](https://elysiajs.com)
- **Validation**: [Zod](https://zod.dev)
- **Database**: MongoDB via Mongoose, PostgreSQL via Bun SQL, Redis via Bun RedisClient
- **Messaging**: MQTT.js
- **Email**: node-imap + mailparser

## License

[MIT](./LICENSE)