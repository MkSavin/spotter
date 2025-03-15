# syntax=docker/dockerfile:1.7-labs

FROM oven/bun:1.2.4-alpine AS base

ARG APP_RELATIVE_PATH

ENV APP_NAME="$(jq -r .name ./${APP_RELATIVE_PATH}/package.json)"

WORKDIR /app

FROM base AS install

COPY package.json .npmrc ./
COPY --parents apps/**/package.json ./
COPY --parents packages/**/package.json ./
RUN bun install -D

FROM base AS bundle

COPY --from=install /app/node_modules ./node_modules
COPY --from=install --parents /app/**/node_modules ./
COPY . .
RUN cd ${APP_RELATIVE_PATH} && bun build --entrypoints ./src/index.ts --outdir ./dist --target bun --env disable

FROM base AS release

COPY --from=bundle /app/${APP_RELATIVE_PATH}/dist/index.js ./
COPY --from=bundle /app/${APP_RELATIVE_PATH}/package.json ./

USER bun
EXPOSE 4000
CMD ["bun", "index.js"]
