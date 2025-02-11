FROM oven/bun:1.2.2-alpine
WORKDIR /app
COPY . .
EXPOSE 4000
CMD ["bun", "run", "start"]
