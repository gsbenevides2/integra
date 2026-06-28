# Integra — AGENTS.md

## Bun Defaults

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads `.env`, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- `Bun.$` instead of execa.

## Testing

Use `bun test` to run tests.

```ts
import { test, expect } from "bun:test";
test("hello world", () => { expect(1).toBe(1); });
```

## Elysia Skills

This project uses the [Elysia skills](https://github.com/elysiajs/elysia-skills) for AI-assisted development.

- Use `bunx skills add elysiajs/skills` to install
- Use `bunx skills` to list available skills

## Project-specific

- **Lint**: `bun run lint`
- **Format**: `bun run format`
- **Start**: `bun run start`
- **Dev**: `bun run dev`
- Scripts go in `src/scripts/<service>/<name>/`
- Triggers are defined in `src/triggers/`
- Instrumentation is automatic — every execution is traced to MongoDB
- Import from `src/` using bare specifiers (tsconfig `baseUrl: "src"`)
