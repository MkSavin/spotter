# syntax=docker/dockerfile:1.7-labs

FROM oven/bun:1.3.14-alpine AS base

ARG APP_RELATIVE_PATH

ENV APP_NAME="$(jq -r .name ./${APP_RELATIVE_PATH}/package.json)"

WORKDIR /app

FROM base AS install

COPY package.json .npmrc ./
COPY --parents apps/**/package.json ./
COPY --parents packages/**/package.json ./
RUN bun install

FROM base AS bundle

COPY --from=install --parents **/node_modules ./
COPY . .
RUN bun build --entrypoints ${APP_RELATIVE_PATH}/src/index.ts --outdir ${APP_RELATIVE_PATH}/dist --target bun --env disable

FROM base AS release

COPY --from=bundle /app/${APP_RELATIVE_PATH}/dist/index.js ./
COPY --from=bundle /app/${APP_RELATIVE_PATH}/package.json ./

# Drizzle migrations are applied on startup; must sit at /app/drizzle (cwd-relative).
COPY --from=bundle /app/${APP_RELATIVE_PATH}/drizzle ./drizzle

USER bun
CMD ["bun", "index.js"]
