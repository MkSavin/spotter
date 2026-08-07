# @spotter/server

## 1.2.1

### Patch Changes

- f90cc0e: Bind the cloud Redis to the tunnel instead of the public internet, and document
  joining an ingest node to an existing AmneziaWG deployment.

  `production.cloud.yml` published Redis on `6379:6379`, i.e. `0.0.0.0` with no
  password — reachable from anywhere the moment the port was open. The published
  address is now `${REDIS_BIND:-127.0.0.1}`, so the default is loopback-only and a
  two-machine setup sets `REDIS_BIND` to the node's VPN address.

  `docs/deployment.md` gains step-by-step instructions for attaching an ingest node
  behind NAT to an AmneziaVPN server raised by the desktop client: issuing the peer
  config, the `/etc/amnezia/amneziawg/` location `awg-quick` requires, narrowing
  `AllowedIPs` from the default `0.0.0.0/0` so camera and S3 traffic stays off the
  tunnel, and why `spotter-forwarder` needs no compose change to reach it.

- f90cc0e: Fix the `spotter` CLI inside the container, so `make token` works again.

  Two separate failures. `bun build --outfile` emits a plain JS file with no
  executable bit and no shebang, so `docker exec spotter-server ./spotter` died
  with `exec format`-style `permission denied` (exit 126) — the CLI is now invoked
  as `bun spotter`.

  Then the database path: the CLI resolved it from `import.meta.dir/../data`,
  which is correct in development (`apps/server/src` → `apps/server/data`) but
  resolves to `/data` in the image, where the bundle sits at `/app`. That is
  outside the mounted volume and unwritable for uid 1000, so every invocation
  failed with `EACCES: mkdir '/data'`. The path now probes candidates the same way
  `db/client.ts` already resolves migrations, keeping the development layout and
  landing on `/app/data` in the container.

  `Makefile`, the installer and `docs/deployment.md` were updated to the working
  invocation.

## 1.2.0

### Minor Changes

- 6fcfb86: Architectural refactoring

### Patch Changes

- Updated dependencies [6fcfb86]
  - stenograph@1.2.0
  - @spotter/transport@1.2.0

## 1.1.0

### Minor Changes

- 538fb94: Full project architecture rework

### Patch Changes

- Updated dependencies [538fb94]
  - stenograph@1.1.0
  - @spotter/transport@1.1.0
