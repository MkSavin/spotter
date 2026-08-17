# @spotter/sink

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
