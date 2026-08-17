# syntax=docker/dockerfile:1.7-labs

# Debian, not alpine: alpine's ffmpeg is built without NVENC.
FROM oven/bun:1.3.14-slim AS base

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

# No CUDA runtime needed: the encoders use the host driver from the gpu overlay.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy binary tooling
COPY --from=bundle /app/node_modules/@img ./node_modules/@img

COPY --from=bundle /app/${APP_RELATIVE_PATH}/dist/index.js ./
COPY --from=bundle /app/${APP_RELATIVE_PATH}/package.json ./

USER bun
EXPOSE 4000
CMD ["bun", "index.js"]
