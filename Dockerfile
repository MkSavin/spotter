FROM oven/bun:1.2.2-alpine
WORKDIR /app
COPY . .
RUN cat .npmrc
RUN bun install
EXPOSE 4000
CMD ["bun", "run", "start"]
