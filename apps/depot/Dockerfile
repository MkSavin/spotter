# syntax=docker/dockerfile:1.7-labs

FROM oven/bun:1.2.4-alpine AS base

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

RUN apk update
RUN apk upgrade
RUN apk add --no-cache ffmpeg

# Copy binary tooling
COPY --from=bundle /app/node_modules/@img ./node_modules/@img

COPY --from=bundle /app/${APP_RELATIVE_PATH}/dist/index.js ./
COPY --from=bundle /app/${APP_RELATIVE_PATH}/package.json ./

USER bun
EXPOSE 4000
CMD ["bun", "index.js"]
