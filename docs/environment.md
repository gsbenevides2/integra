# Environment

## Requirements

- **Bun** >= 1.3.13
- **MongoDB** (for instrumentation/tracing)

## Quick Start

```bash
# Install dependencies
bun install

# Copy and configure environment
cp .env .env.local
# Edit .env.local with your settings

# Run in development mode (with file watching)
bun run dev

# Run in production
bun run start

# Run with specific triggers and debug
bun run start --only-run=authentik:loginFailed --debug
```

## Code Quality

```bash
# Lint
bun run lint

# Lint and fix
bun run lint:fix

# Format check
bun run format

# Format and write
bun run format:fix
```

## Project Conventions

- **Runtime**: Bun (never Node.js)
- **HTTP Framework**: Elysia (never Express)
- **Validation**: Zod
- **Database ORM**: Mongoose (MongoDB)
- **Database Client**: Bun's built-in `SQL` for PostgreSQL, Bun's `RedisClient` for Redis
- **Testing**: `bun test`
- **Linting**: ESLint with typescript-eslint
- **Formatting**: Prettier
- **Module System**: ESM (`"type": "module"`)
- **Import Style**: Bare specifier with `baseUrl: "src"` in tsconfig