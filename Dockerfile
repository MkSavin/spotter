FROM oven/bun:1.0.20-alpine
WORKDIR /app
COPY package.json .
RUN bun install
COPY . .
EXPOSE 4000
CMD ["bun", "run", "start"]
