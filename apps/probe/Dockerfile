# Rust, not Bun: the ZeroMQ binding the Frigate plugin needs panics under Bun
# (unsupported uv function: uv_async_init), and a second JS runtime beside Bun
# invites someone to write a service on it. A 10 MB static binary cannot be
# mistaken for an alternative runtime.
#
# Everything builds inside Docker, so no toolchain lands on a developer machine
# or on a node — only this image, and only under the `probe` compose profile.
FROM rust:1-alpine AS build

RUN apk add --no-cache musl-dev

WORKDIR /src

# Dependencies first: they change far less often than the source.
COPY Cargo.toml ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs && \
    cargo build --release && rm -rf src

COPY src ./src
# Touch so cargo rebuilds the real main after the dependency-only pass.
RUN touch src/main.rs && cargo build --release

FROM alpine:3

COPY --from=build /src/target/release/spotter-probe /usr/local/bin/spotter-probe

# ZMQ for Frigate's detector, HTTP for the test command.
EXPOSE 5555 8080

ENTRYPOINT ["spotter-probe"]
