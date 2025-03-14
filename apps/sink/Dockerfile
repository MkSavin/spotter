FROM oven/bun:1.2.4-alpine AS base

WORKDIR /app

FROM base AS install

COPY package.json bun.lock .npmrc ./
RUN bun install

FROM base AS bundle

COPY --from=install /app/node_modules node_modules
COPY . .
RUN bun build --entrypoints ./src/index.ts --outdir ./dist --target bun --env disable

FROM base AS release

COPY --from=bundle /app/dist/index.js ./
COPY --from=bundle /app/package.json ./

USER bun
EXPOSE 4000
CMD ["bun", "index.js"]
