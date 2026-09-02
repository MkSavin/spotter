# @spotter/email

## 0.2.1

### Patch Changes

- b854a99: fix: keep the optional frontends across `spotter update`
  
  The PWA/email choice now lives in `SPOTTER_PROFILES` in `.env`. It used to exist only as a `--pwa`/`--email` flag, so any later command without the flag rebuilt the stack without those services. `spotter-pwa` and `spotter-email` moved from `production.cloud.yml` into a shared `production.frontends.yml`, which also makes them available on a `single` node — the installer offered them there, but nothing defined them. `spotter doctor` now expects whichever frontends are enabled.

## 0.2.0

### Minor Changes

- 3ed7822: feat: bound table growth. Events, dedup ledgers and message links are trimmed by age, and access codes now expire (`ACCESS_CODE_TTL_HOURS`, a day by default)

### Patch Changes

- 0ecd990: feat: report queue depth in the heartbeat and show it in `/status`: how many entries are waiting, how many are in flight, and the age of the oldest unacked one
- Updated dependencies [2b590c2]
- Updated dependencies [0ecd990]
- Updated dependencies [3ed7822]
- Updated dependencies [93d636e]
- Updated dependencies [b389438]
- Updated dependencies [152ccba]
  - @spotter/transport@1.8.0

## 0.1.5

### Patch Changes

- 32d9796: chore: upgrade the runtime to Bun 1.4
- Updated dependencies [6fb558c]
- Updated dependencies [714cf4e]
- Updated dependencies [044e6ae]
- Updated dependencies [fdd83e2]
- Updated dependencies [18a45ec]
  - @spotter/transport@1.7.0

## 0.1.4

### Patch Changes

- a53eb49: fix: survive a restart of any other service at any time
  
  Watchtower can restart anything at any moment, so every service has to tolerate every other one disappearing under it. Several could not, and the failures shared one shape: the process stayed alive and the container stayed "running" while the service did nothing at all — so the restart policy never fired and the problem was only visible to users.
  
  **A Redis client that outlives its connection timeout is finished.** Measured against a real server: an outage under ~10s is absorbed by the offline queue and never surfaces, but a longer one puts the client in a state it never leaves — Redis came back and every command still failed, indefinitely. `maxRetries` does not change this; the two configurations were compared directly and neither recovers. Only a new client does, which is why recreating the container was the one thing that ever worked. `RedisConnection` now owns the client and rebuilds it on a dead connection, recovering in about a second, and all sixteen call sites use it.
  
  **A consumer group that disappears never comes back.** A Redis restored without its data answers every `XREADGROUP` with `NOGROUP`, and the read loop retried that forever, once a second, with no possible outcome. The loop now recognises it and recreates the groups.
  
  **A wedged service was indistinguishable from a working one.** No `spotter-*` container had a healthcheck. Each now refreshes a marker file only while Redis actually answers it, so a service that stops working goes stale and gets restarted; a brief blip stays well inside the threshold.
  
  **A clip request did not survive the bot.** The wait lived in memory, so a restart left the "⏳" button frozen with no way to retry even after the video arrived. Waits are persisted and released on startup as a retry.
  
  Depot also sweeps temp directories left by a killed predecessor — each run creates a fresh one, so the orphans accumulated — and gets a 45s stop grace period, since ffmpeg cannot finish inside Docker's default 10s.
- Updated dependencies [a53eb49]
- Updated dependencies [a53eb49]
- Updated dependencies [a53eb49]
  - @spotter/transport@1.6.0

## 0.1.3

### Patch Changes

- f6ff724: refactor: share CatalogCache and catalogController from transport
  
  The catalog controller was byte-identical in telegram, pwa and email, and four near-identical `CatalogCache` copies had already started drifting apart in comments and helpers. Both now live in `@spotter/transport`, where the rest of the catalog contract already sits, so a change to label resolution is one edit instead of four.
- Updated dependencies [f6ff724]
- Updated dependencies [f6ff724]
  - @spotter/transport@1.5.2

## 0.1.2

### Patch Changes

- dbb2afa: fix: install only the dependencies each image actually uses
  
  Every Dockerfile ran an unfiltered `bun install`, so each backend image downloaded the PWA's frontend toolchain — vite, tailwind and lightningcss's native prebuilds. The arm64 leg then failed extracting `lightningcss-linux-arm64-musl`, a package none of those apps import. The install stage now takes the package name as a build argument and passes it to `--filter`, which drops the telegram image from the full dependency tree to 81 packages and leaves the workspace symlinks intact.

## 0.1.1

### Patch Changes

- 084d12a: Replace `/deployment_version` with `/status`, reporting every service instead of
  just the bot.
  
  The old command read the bot's own `package.json`, so it could only ever show
  one version. Services now announce themselves on `spotter.heartbeat` — name,
  version, node and uptime — on start and every 30 seconds; the bot keeps the
  latest report per service and renders them grouped by node.
  
  Carried on a stream rather than a Redis key, because keys do not cross the
  forwarder: a key-based report would leave the cloud bot blind to everything
  running on the ingest node.
  
  A service that dies stops reporting rather than announcing it, so reports older
  than three intervals are shown as offline instead of vanishing — an outage stays
  visible in the output.
  
  Services also report what they run on: the frigate adapter probes the NVR build
  via `/api/version`, depot reports its ffmpeg and the active acceleration, and
  server and telegram report the Redis server version. Probes resolve once and
  swallow their own failures — a broken probe must not cost the heartbeat.
- Updated dependencies [084d12a]
  - @spotter/transport@1.4.0

## 0.1.0

### Minor Changes

- a3b3b65: New optional email frontend (`apps/email`): a headless SMTP consumer of
  `spotter.delivery.event` that sends one notification email per event. Meant as a
  cheap, additional channel — not the primary frontend (PWA) nor the emergency
  guarantee (SMS): email is reachable everywhere with no install and, via a
  Russian-provider mailbox, stays available during "whitelist" shutdowns.

  Sends only on `create` (no edit-threads), dedups redelivery via a
  `notified_events` SQLite ledger (atomic claim, rolled back on SMTP failure so
  the regulator retries), presigns the snapshot key into the body and links back
  into the web frontend. Labels come from the shared `CatalogCache`; addressing is
  channel-local (`EMAIL_RECIPIENTS`, bcc). `EMAIL_MODE=always|fallback` (fallback
  reserved for the cross-channel ACK-trigger, not built yet). Ships an
  `.env.email.example`, an optional (commented) service in `production.cloud.yml`,
  and per-app `AGENTS.md`.

### Patch Changes

- Updated dependencies [52344b5]
  - @spotter/transport@1.3.0
