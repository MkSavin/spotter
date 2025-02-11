FROM oven/bun:1.2.2-alpine
WORKDIR /app
COPY package.json .
COPY .npmrc .
RUN bun install
COPY . .
EXPOSE 4000
CMD ["bun", "run", "start"]
