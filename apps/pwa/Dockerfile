# syntax=docker/dockerfile:1.7-labs

# Build on glibc: Vite 8 rollup native bindings fail on musl/alpine.
# Install in-place so Bun's symlink store stays intact for rollup bindings.
FROM oven/bun:1.4.0 AS bundle

ARG APP_RELATIVE_PATH
ARG APP_PACKAGE_NAME
WORKDIR /app

# Scopes the install cache per arch.
ARG TARGETARCH
# Keeps the other apps' dependencies out of the frontend build.
ARG APP_PACKAGE_NAME

COPY package.json bun.lock ./
COPY --parents apps/**/package.json ./
COPY --parents packages/**/package.json ./
RUN --mount=type=cache,target=/root/.bun/install/cache,id=bun-$TARGETARCH,sharing=locked \
    bun install --frozen-lockfile --filter "$APP_PACKAGE_NAME"

COPY . .

RUN cd ${APP_RELATIVE_PATH} && bun --bun vite build web
RUN bun build --entrypoints ${APP_RELATIVE_PATH}/src/index.ts --outdir ${APP_RELATIVE_PATH}/dist --target bun --env disable

FROM oven/bun:1.4.0-alpine AS release

ARG APP_RELATIVE_PATH
WORKDIR /app

COPY --from=bundle /app/${APP_RELATIVE_PATH}/dist/index.js ./
COPY --from=bundle /app/${APP_RELATIVE_PATH}/package.json ./
COPY --from=bundle /app/${APP_RELATIVE_PATH}/web/dist ./web/dist
COPY --from=bundle /app/${APP_RELATIVE_PATH}/drizzle ./drizzle

# Writable data dir for the SQLite db (mount a volume here to persist).
RUN mkdir data && chown bun:bun data

USER bun
EXPOSE 3000
CMD ["bun", "index.js"]
