FROM oven/bun:1.2.2-alpine
WORKDIR /app
COPY . .
RUN echo -n '//npm.pkg.github.com/:_authToken=${NPM_TOKEN}' > ~/.npmrc
RUN bun install
EXPOSE 4000
CMD ["bun", "run", "start"]
