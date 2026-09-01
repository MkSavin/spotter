# syntax=docker/dockerfile:1.7-labs

FROM oven/bun:1.4.0-alpine AS base

ARG APP_RELATIVE_PATH
ARG APP_PACKAGE_NAME

ENV APP_NAME="$(jq -r .name ./${APP_RELATIVE_PATH}/package.json)"

WORKDIR /app

FROM base AS install

# Scopes the install cache per arch.
ARG TARGETARCH
# Without the filter every image also installs the pwa toolchain.
ARG APP_PACKAGE_NAME

COPY package.json bun.lock ./
COPY --parents apps/**/package.json ./
COPY --parents packages/**/package.json ./
RUN --mount=type=cache,target=/root/.bun/install/cache,id=bun-$TARGETARCH,sharing=locked \
    bun install --frozen-lockfile --filter "$APP_PACKAGE_NAME"

FROM base AS bundle

# `--parents` would nest this as /app/app/node_modules.
COPY --from=install /app/node_modules ./node_modules
COPY . .
RUN bun build --entrypoints ${APP_RELATIVE_PATH}/src/index.ts --outdir ${APP_RELATIVE_PATH}/dist --target bun --env disable

FROM base AS release

COPY --from=bundle /app/${APP_RELATIVE_PATH}/dist/index.js ./
COPY --from=bundle /app/${APP_RELATIVE_PATH}/package.json ./

# Drizzle migrations are applied on startup; must sit at /app/drizzle (cwd-relative).
COPY --from=bundle /app/${APP_RELATIVE_PATH}/drizzle ./drizzle

USER bun
CMD ["bun", "index.js"]
