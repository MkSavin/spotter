FROM oven/bun:1.2.2-alpine

RUN apk update
RUN apk upgrade
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY ./dist .

EXPOSE 4000

CMD ["bun", "index.js"]
