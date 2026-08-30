# @spotter/sink

## 1.3.5

### Patch Changes

- edbd2d6: fix: notice cameras added in the NVR without restarting the adapter
  
  The catalog was published exactly once per process lifetime. `keepCatalogPublished` retried only until the first snapshot landed and then stopped, and `FrigateCatalog` memoized the `/api/config` response forever, so a camera added in Frigate stayed invisible to the bot until `spotter-frigate` was restarted. The schema comment promised "on start and on change", but nothing implemented the second half.
  
  The loop now keeps going after the first success on a slow interval, and `publishCatalog` compares the serialized snapshot against the last one it sent — an unchanged catalog is not republished, so the refresh does not wake every consumer on a timer. The `/api/config` memo gained a TTL, without which the loop would keep re-reading the same cached answer.
  
  `camera_snapshot` also skipped validation entirely when the catalog was empty: the `cameras.length > 0` guard sat in front of the comparison, so any typed name went straight to the NVR.
- Updated dependencies [45330ee]
- Updated dependencies [edbd2d6]
  - @spotter/sink@1.3.4
  - @spotter/transport@1.5.5

## 1.3.4

### Patch Changes

- b852ae0: fix: stop sending an event several times to the same chat
  
  Two defects compounded into duplicate messages (seen on event `oemp2q`, delivered three times).
  
  Frigate's `new` event was being dropped by the zero-movement guard — the NVR genuinely reports `position_changes: 0` on `new`, and 1798 events hit that path in a single log. Without a `start` the frontend never records a message id, so every later delivery took the "no message yet" branch and sent a fresh one. The guard now applies only to mid-life `update`s, where it was actually aimed.
  
  Then `event_messages` was persisted with a delete-then-insert, so a delivery whose sends all failed wrote an empty list and erased the chats that had already been messaged. The retry no longer recognised them and sent again. Persistence is now an additive upsert (`record`), with removal split out into an explicit `forget`.
- Updated dependencies [313ab95]
  - @spotter/transport@1.5.3
  - @spotter/sink@1.3.3

## 1.3.3

### Patch Changes

- f6ff724: refactor: read config through resolveConfig and cover the untested paths
  
  `transcode.ts` read eleven env vars at module scope, so the values froze at import time, skipped the redacted startup dump and could not be swapped in tests — which is why the largest file in the repo had the thinnest coverage. They now belong to `config.video`/`config.image` and arrive as an argument.
  
  Test coverage follows the same reasoning: `CommandBus` (RPC correlation, timeout, replies addressed to another replica, junk on the stream) had none despite driving the whole "Видео" button flow, so its timeouts became injectable and it is now covered. The frigate test-seed controller's id/timestamp derivation moved into a pure `resolveEventTestPayload`, and the dead-letter boundary gained a test that pins the exact threshold.
- Updated dependencies [f6ff724]
- Updated dependencies [f6ff724]
  - @spotter/transport@1.5.2

## 1.3.2

### Patch Changes

- dbb2afa: fix: install only the dependencies each image actually uses
  
  Every Dockerfile ran an unfiltered `bun install`, so each backend image downloaded the PWA's frontend toolchain — vite, tailwind and lightningcss's native prebuilds. The arm64 leg then failed extracting `lightningcss-linux-arm64-musl`, a package none of those apps import. The install stage now takes the package name as a build argument and passes it to `--filter`, which drops the telegram image from the full dependency tree to 81 packages and leaves the workspace symlinks intact.

## 1.3.1

### Patch Changes

- 1cdbb9a: fix: MQTT broker is configurable, not hard-wired
  
  The broker address moved from compose into `.env`, so an existing broker can be used instead of ours. Our own mosquitto now lives behind the `mqtt` profile and joins the external `spotter-mqtt` network, which a Frigate container can join to reach it without opening a host port. The installer asks which of the two applies, and `doctor` checks that the broker is reachable and that events actually arrive.
- a43b136: fix: join an existing broker's docker network
  
  Pointing `MQTT_BROKER` at a broker running in another compose project failed two ways: our own mosquitto still started and collided on port 1883, and the adapter could not resolve the broker's name (`getaddrinfo ESERVFAIL`) because it was not on that network. `MQTT_NETWORK` now names the broker's network to join, and whether we start a broker of our own is decided by `MQTT_NETWORK_EXTERNAL` rather than by the host name — someone else's broker is very often called `mosquitto` too.

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
- Updated dependencies [ec9422d]
- Updated dependencies [084d12a]
  - @spotter/sink@1.2.1
  - @spotter/transport@1.4.0

## 1.2.1

### Patch Changes

- 53f39ad: fix: cli doctor and cli logs follow

## 1.2.0

### Minor Changes

- 6fcfb86: Architectural refactoring

### Patch Changes

- Updated dependencies [6fcfb86]
  - @spotter/sink@1.2.0
  - stenograph@1.2.0
  - @spotter/transport@1.2.0

## 1.1.0

### Minor Changes

- 538fb94: Full project architecture rework

### Patch Changes

- Updated dependencies [538fb94]
  - @spotter/sink@1.1.0
  - stenograph@1.1.0
  - @spotter/transport@1.1.0

## 1.0.3

### Patch Changes

- d7e607b: fix: User authorization caching. DayJS removed
- Updated dependencies [d7e607b]
  - @spotter/transport@1.0.2

## 1.0.2

### Patch Changes

- dc9bc6b: Overall stability fixes and improvements
- Updated dependencies [dc9bc6b]
  - stenograph@1.0.2

## 1.0.1

### Patch Changes

- 44b65ca: fix(bot): bot cluster fixes
