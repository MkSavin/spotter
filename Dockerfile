FROM oven/bun:1.2.2-alpine

WORKDIR /app

COPY . .

RUN apt-get update && apt-get install -y ffmpeg

EXPOSE 4000

CMD ["bun", "run", "start"]
