FROM oven/bun:1.2.4-alpine AS base

WORKDIR /app

FROM base AS install

COPY package.json bun.lock .npmrc ./
RUN bun install

FROM base AS schema

COPY --from=install /app/node_modules ./node_modules
COPY ./prisma /app/prisma/
RUN bunx prisma generate

FROM base AS bundle

COPY --from=schema /app/node_modules node_modules
COPY . .
RUN bun build --entrypoints ./src/index.ts --outdir ./dist --target bun --env disable

FROM base AS release

RUN apk update
RUN apk upgrade
RUN apk add --no-cache ffmpeg

# Copy binary tooling
COPY --from=bundle /app/node_modules/@img ./node_modules/@img
COPY --from=bundle /app/node_modules/.prisma/client ./node_modules/.prisma/client

COPY --from=bundle /app/dist/index.js ./
COPY --from=bundle /app/package.json ./

USER bun
EXPOSE 4000
CMD ["bun", "index.js"]
