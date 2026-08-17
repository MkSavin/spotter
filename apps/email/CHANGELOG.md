# @spotter/email

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
