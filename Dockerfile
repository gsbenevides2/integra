# syntax=docker/dockerfile:1
FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production

COPY package.json bun.lock bunfig.toml ./
COPY patches ./patches
RUN bun install --frozen-lockfile

COPY . .

# ponytail: bun build --compile fails ahead-of-time bundling the frontend's
# @opentelemetry browser packages (resolves Node builtins instead of browser
# exports). Running from source works today; revisit --compile if startup
# memory becomes a problem.
EXPOSE 3000
CMD ["bun", "run", "server/index.ts"]
