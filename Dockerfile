FROM oven/bun:1.2.2-alpine

WORKDIR /app

COPY . .

RUN apk update
RUN apk upgrade
RUN apk add --no-cache ffmpeg

RUN bunx prisma generate

EXPOSE 4000

CMD ["bun", "run", "start"]
