# syntax=docker/dockerfile:1
FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json bun.lock bunfig.toml ./
COPY patches ./patches
RUN bun install --frozen-lockfile

COPY . .

# Offline Portuguese model for the assistant's "Hey Integra" wake word (~32 MB,
# not committed). Skipped when the build context already has it.
RUN bun run assistant:model

# Frontend and server prebuilt here (RUM settings come from /client-config at
# runtime). Measured idle RSS: ~280 MB from source vs ~205 MB bundled; --smol
# made no difference. node_modules stays: vosk assets and gaxios resolve there.
# ponytail: bun build --compile still fails on public/index.html (it resolves the
# Node builds of @opentelemetry); revisit if image size matters.
RUN bun run build:web
EXPOSE 3000
CMD ["bun", "dist/server/index.js"]
