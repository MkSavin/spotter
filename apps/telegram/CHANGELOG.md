# @spotter/telegram

## 1.4.0

### Minor Changes

- e0b21d8: feat: rollout notices for admins
  
  Telegram tracks the version of every service in SQLite and sends admins a silent
  notice once a rollout settles. Versions persist, so a restart of the bot itself
  reports nothing, and a service updated while the bot was down is still caught.

### Patch Changes

- 74369d7: fix: unknown command message and cli refactor

## 1.3.0

### Minor Changes

- ae4d268: Add `/test_media` — an end-to-end test that exercises the real media pipeline.
  
  `/test_delivery` seeds a synthetic event, so the NVR 404s every media request for
  it: useful for checking delivery, useless for checking media. `/test_media` asks
  Frigate to create an actual event via `POST /api/events/{camera}/{label}/create`,
  waits for the footage, ends it, and publishes the canonical event with the id
  Frigate assigned. The clip genuinely exists, so staging, transcoding, presigning
  and delivery all run for real.
  
  Frigate does not announce manual events on `frigate/events`, which is why the
  adapter publishes the canonical event itself rather than waiting to observe one.
  The Frigate calls happen on the ingest node, next to the NVR — the cloud never
  needs access to it.
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

### Patch Changes

- ec9422d: Answer media requests even when the NVR has nothing to give.
  
  `createMediaController` returned silently when staging produced no keys — the
  NVR 404s an event it no longer has, or never had. Nothing was published, so the
  bot's "Видео обрабатывается…" button stayed that way forever, with no timeout to
  clear it. It now publishes a `MediaProcessed` with no keys, and the bot restores
  the "Видео" button instead of leaving the message stuck.
  
  The empty answer is what `test_delivery` exposed — its synthetic ids exist in no
  NVR — but the same path is hit by real events whose recordings have aged out.
- Updated dependencies [084d12a]
  - @spotter/transport@1.4.0

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
