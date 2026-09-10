FROM oven/bun:1 AS build
ARG TOKEN_GITHUB
WORKDIR /app
COPY package.json bun.lock ./
RUN printf '%s\n' "//npm.pkg.github.com/:_authToken=${TOKEN_GITHUB}" "@gsbenevides2:registry=https://npm.pkg.github.com" > /root/.npmrc && \
    bun install --frozen-lockfile --production && \
    rm -f /root/.npmrc
COPY . .
RUN bun run build


FROM oven/bun:1-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/assets ./assets
USER bun
CMD ["bun", "run", "dist/index.js"]