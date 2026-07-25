FROM oven/bun:1 AS build
ARG TOKEN_GITHUB
WORKDIR /app
RUN cat > /root/.npmrc <<EOF
//npm.pkg.github.com/:_authToken=${TOKEN_GITHUB}
@gsbenevides2:registry=https://npm.pkg.github.com
EOF
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY . .
RUN bun build src/index.ts --outdir dist --target bun --sourcemap=external


FROM oven/bun:1-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/assets ./assets
USER bun
CMD ["bun", "run", "dist/index.js"]