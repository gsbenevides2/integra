# syntax=docker/dockerfile:1

# package.json with the version zeroed: every PR bumps it, and the real file
# would invalidate the cached `bun install` layer on every build. bun.lock does
# not record the root version, so --frozen-lockfile still holds.
FROM oven/bun:1-alpine AS manifest
WORKDIR /app
COPY package.json ./
RUN bun -e 'const p = await Bun.file("package.json").json(); p.version = "0.0.0"; await Bun.write("package.json", JSON.stringify(p, null, 2));'

FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=manifest /app/package.json ./
COPY bun.lock bunfig.toml ./
COPY patches ./patches
RUN bun install --frozen-lockfile

# Offline Portuguese model for the assistant's "Hey Integra" wake word (~32 MB,
# not committed). Fetched before the source is copied so the layer stays cached
# until the download script changes.
COPY scripts/download-vosk-model.ts ./scripts/
RUN bun run assistant:model

# Brings the real package.json (with the version) along with the source.
COPY . .

# Frontend and server prebuilt here (RUM settings come from /client-config at
# runtime). Measured idle RSS: ~280 MB from source vs ~205 MB bundled; --smol
# made no difference. node_modules stays: vosk assets and gaxios resolve there.
# ponytail: bun build --compile still fails on public/index.html (it resolves the
# Node builds of @opentelemetry); revisit if image size matters.
RUN bun run build:web
EXPOSE 3000
CMD ["bun", "dist/server/index.js"]
