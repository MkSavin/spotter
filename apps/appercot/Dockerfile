# syntax=docker/dockerfile:1.7-labs

FROM oven/bun:1.4.0-alpine AS build
WORKDIR /app

ARG TARGETARCH
ARG APP_RELATIVE_PATH=apps/appercot
ARG APP_PACKAGE_NAME=@spotter/appercot
COPY package.json bun.lock ./
COPY --parents apps/**/package.json ./
COPY --parents packages/**/package.json ./
RUN --mount=type=cache,target=/root/.bun/install/cache,id=bun-$TARGETARCH,sharing=locked \
    bun install --frozen-lockfile --filter "$APP_PACKAGE_NAME"
COPY packages/transport ./packages/transport
COPY packages/stenograph ./packages/stenograph
COPY ${APP_RELATIVE_PATH}/src ${APP_RELATIVE_PATH}/src
COPY ${APP_RELATIVE_PATH}/drizzle ${APP_RELATIVE_PATH}/drizzle
RUN bun build --entrypoints "${APP_RELATIVE_PATH}/src/index.ts" --outdir /bundle --target bun --env disable \
    && cp -r "${APP_RELATIVE_PATH}/drizzle" /bundle/drizzle

FROM oven/bun:1.4.0-alpine
WORKDIR /app
COPY --from=build /bundle/ ./
RUN mkdir /app/data && chown bun:bun /app/data
USER bun
CMD ["bun", "index.js"]
