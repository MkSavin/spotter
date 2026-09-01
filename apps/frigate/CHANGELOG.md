# @spotter/sink

## 1.5.0

### Minor Changes

- 2b590c2: Управление тишиной: `/mute` и `/unmute` глушат отдельный чат, `/nvr_suspend` (ADMIN) приглушает уведомления самого NVR через новый порт `NotificationSuspender`
- 93d636e: Фильтрация по вердикту NVR: адаптер читает `frigate/reviews` и проставляет событию `severity`, а `DELIVERY_POLICY=alerts` оставляет пуши только для алертов
- 152ccba: Долгие таймлапсы больше не падают по часам: дедлайн 12 ч (`TIMELAPSE_DEADLINE_HOURS`) и проверка у NVR перед отказом. Добавлен живой статус и команда `/timelapse_status`

### Patch Changes

- Updated dependencies [2b590c2]
- Updated dependencies [0ecd990]
- Updated dependencies [3ed7822]
- Updated dependencies [93d636e]
- Updated dependencies [b389438]
- Updated dependencies [152ccba]
  - @spotter/transport@1.8.0
  - @spotter/sink@1.5.0

## 1.4.1

### Patch Changes

- 32d9796: Обновление рантайма до Bun 1.4
- a7de7d7: fix: drop disabled cameras from the catalog
  
  A camera turned off in Frigate stayed in `camera_list`, and a snapshot or timelapse requested against it would never be answered. Disabling a camera does not remove it from `/api/config` — Frigate marks it with `enabled: false` and keeps the section — and the catalog read every key it found there.
  
  Object types are still collected from every camera, disabled ones included: the taxonomy also renders events a camera left behind before it was turned off.
- Updated dependencies [6fb558c]
- Updated dependencies [714cf4e]
- Updated dependencies [044e6ae]
- Updated dependencies [fdd83e2]
- Updated dependencies [18a45ec]
  - @spotter/transport@1.7.0

## 1.4.0

### Minor Changes

- a53eb49: feat: build timelapses over a chosen period
  
  `/timelapse` asks for a camera and a speed with buttons and takes the period as text — `сегодня`, `вчера`, `15.08`, or `15.08 09:00-18:00`. The period is read in the bot's own timezone; parsing it as UTC would have shifted every export by the offset, silently returning the wrong hours.
  
  **Two speeds, not a number.** Frigate's export API accepts exactly `realtime` and `timelapse_25x` — verified against the v0.17.0 source, and the open request for a per-export factor is still unimplemented. What the second one compresses to is set by `record.export.timelapse_args` in the NVR's config and applies globally, so the button says "ускоренно" rather than promising a multiplier this side cannot know.
  
  **An export is not a download.** It re-encodes hours of recordings and runs for minutes, well past the regulator's five-minute reclaim window. Waiting for it inside the request handler would leave the entry pending until the reaper handed it to another consumer, which would start the same export a second time. So the adapter acknowledges as soon as the NVR accepts the job, and a tracker polls it to completion, stages the result into S3 and publishes `spotter.timelapse.ready` — or `.failed` with a reason the user can act on, rather than a message that never updates.
  
  Started exports are recorded on a volume and resumed on startup: a restart mid-encode would otherwise leave the NVR producing a file nobody is waiting for. The forwarder carries the new streams both ways, since on a split deployment the bot and the adapter sit on different nodes. The finished file is fetched from Frigate's nginx — the export record's `video_path` points inside the container — and deleted from the NVR once it is safely in S3.

### Patch Changes

- Updated dependencies [a53eb49]
- Updated dependencies [a53eb49]
- Updated dependencies [a53eb49]
  - @spotter/transport@1.6.0
  - @spotter/sink@1.4.0

## 1.3.6

### Patch Changes

- e9837f1: feat: recover a snapshot from the recording, and say when there is none
  
  Some events arrived as bare text and nothing explained why. Frigate writes an event snapshot only once tracking ends and it has picked a "best" frame, so an event lasting under a second never gets one — `/api/events/{id}/snapshot.jpg` then answers 404 for good.
  
  Two things were wrong with how that was handled. The 404 was treated as temporary, so the entry was retried five times over roughly 25 minutes, each attempt occupying a worker on an answer that could not change, before landing in the DLQ. `stageMedia` now separates a verdict (404 → the artifact does not exist) from a transient condition (5xx, network, empty body), and a request whose every kind came back absent is reported as final instead of retried. A 404 on one kind while another is merely unavailable still retries, so a missing clip does not cancel a snapshot that is on its way.
  
  Frigate does keep a continuous recording of that moment even when it has no event snapshot, so the adapter now falls back to a frame cut from it — the midpoint of the event, where the object is likelier to be in view. `resolveEventFrame` is optional on `MediaProvider`; adapters without recordings simply omit it and behave as before. The frame carries no bounding box, and retention may already have dropped it, in which case the event is genuinely pictureless.
  
  The message says which of those happened: `📸 В обработке` while the snapshot is on its way, `🙈 Без снимка` once the NVR has ruled it out, and neither once the photo is attached.
  
  Dialog prompts are also removed once answered rather than left in the chat as spent questions.
- Updated dependencies [e9837f1]
- Updated dependencies [e9837f1]
  - @spotter/transport@1.5.6
  - @spotter/sink@1.3.5

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
