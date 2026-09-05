# @spotter/sink

## 1.6.1

### Patch Changes

- 9108030: refactor: read the S3 block in one place
  
  Six services declared the same `S3Config` type and read the same four `S3_*` variables, each with its own copy of the defaults. Adding a variable meant editing six files and hoping none was missed. `resolveS3Config` in transport now owns the block, the way `resolveRedisConfig` already owned the Redis one; `SinkS3Config` extends it with the staging prefix only adapters need.
  
  Also removed: a dead `innoxiousHelpers` export nothing imported, three redundant named JWT exports beside the default object every caller actually uses, and the `typecheck:full` script, which had become a second name for `tsc --noEmit` — the docs pointing at it as a wider check were saying something untrue.
  
  `zod` in pwa, `abort-controller` in telegram and the changesets read/write packages at the root were imported but only resolved transitively; they are declared now.
- d0e5fd5: refactor: share the guards every controller and domain call repeated
  
  Nine stream controllers opened with the same four lines — decode the buffer, bail on empty, run the schema, bail on null — and eight call sites wrapped `commandBus.send` in the same try/catch. Both are now single helpers: `parsedController` in the regulator, `trySendCommand` alongside `CommandBus`, plus `askDomain` in the telegram command framework for the two answers every command shares.
  
  The point is less the lines saved than the guards no longer being a matter of discipline: a controller cannot forget to validate, and a command cannot forget that `send` throws when the domain is unreachable.
  
  Writing tests for the wrapper surfaced a bug the hand-written version had everywhere: `bufferToJson` throws on malformed JSON rather than returning null, so the `if (!value) return` guard never covered it. Such a message burned all five delivery attempts before reaching the dead-letter stream. `parsedController` drops it on the first pass — a body that is not JSON will not become JSON on a retry.
  
  `CommandReply` turned out to be exported already, so the `Awaited<ReturnType<typeof context.commandBus.send>>` in eight files was never necessary.
- Updated dependencies [9108030]
- Updated dependencies [d0e5fd5]
  - @spotter/transport@1.10.0

## 1.6.0

### Minor Changes

- 44487a6: feat: report the NVR's own camera health
  
  Silence from a source cannot tell a quiet driveway from a camera whose stream dropped — but the NVR knows within seconds. The Frigate adapter now polls `/api/stats` in the background and reports, per camera, whether video is arriving and whether the detector sees it. Both appear in `/status`: a dead camera leads the message, and every adapter shows when it last saw an event.
  
  Two distinct faults are separated, because they need different fixes: a camera with no frames at all (the stream is gone) and a camera with frames the detector never sees (video is fine, no event can be produced). A camera with detection deliberately switched off is neither, and is never reported.
  
  State transitions are logged rather than the state itself, so a stream that drops at 02:00 leaves a line saying so instead of one repeated line a minute. A failed probe keeps the last good reading — not being able to ask is not evidence of health.
  
  fix: stop asking Frigate to end a manual event that has a duration
  
  `/event_test real` created the event with a duration, so Frigate closes it itself and refuses the manual end, leaving `has a set duration and can not be ended manually` in the NVR's log on every test run.
- 8359b18: feat: warn when an NVR stops sending events
  
  An adapter whose source goes quiet was indistinguishable from a healthy one: it stays connected, passes its healthcheck and reports a green heartbeat while the NVR behind it has stopped publishing. A break went unnoticed for a day that way, with the bot saying nothing. Adapters now report when they last saw an event, and `/status` leads with a warning after six hours of silence instead of showing a green tick.
  
  fix: subscribe to MQTT topics one at a time
  
  A broker refusing a single topic (an ACL, a topic its version does not know) failed the whole batch, so an optional subscription could take the essential one down with it. Refusals are now logged and skipped; only a node where every topic fails still errors out.
  
  Container logs are capped and rotated (3 × 10 MB per service). The default json-file driver keeps one unbounded file and discards it when a container is recreated — which is when its history is most wanted.
- 757f521: feat: alert when the NVR stops talking, instead of waiting to be told
  
  The adapter now tracks when its NVR last said *anything* on the transport, not only when it last produced an event, and the bot checks that on a timer and messages admins the moment it goes stale.
  
  This is the signal that was missing in September 2026. Frigate lost its route to the broker and published nothing for 60 hours while every other indicator stayed green: the adapter was connected, subscribed and beating, the NVR answered HTTP and served video. Nothing was watching the one thing that had actually stopped, and a break went unnoticed.
  
  Two thresholds, deliberately far apart, because they answer different questions. Event silence (6 hours) can be a quiet night and cannot be shortened without crying wolf every winter morning. No housekeeping traffic at all (15 minutes) is never normal — Frigate publishes `frigate/stats` once a minute regardless of what happens in front of the cameras, which is measured on the rig rather than taken from the docs. Where a source reports contact, event silence stops raising anything on its own: an NVR that is demonstrably alive and simply has nothing to report is not a fault.
  
  The check runs on a timer rather than on heartbeat arrival, which is the whole point: a broken NVR does not send a message saying it is broken. Alerts fire on transitions only — one at the outage, one at recovery with how long it lasted — because a warning that repeats every minute gets muted, and then the next outage goes unseen too. The outage alert makes a sound; the recovery does not.
  
  `/status` shows the same state as its own line, above the source figures — otherwise "last event an hour ago" reads as good news.

### Patch Changes

- 79f802b: feat: stamp every log line with `dd.mm.yyyy hh:mm:ss`
  
  A log said what happened but not when, so correlating our lines against an NVR's or a broker's meant guessing. The time is local, since container logs are read next to a wall clock and `TZ` is already set per node.
  
  fix: stop the catalog from burying the log
  
  `Catalog for "..." unchanged` is gone: it was the expected outcome of every quiet refresh and said nothing. A forced republish of an identical catalog drops to debug — only a catalog that actually differs stays at info, because that means cameras appeared or went away. Twelve quiet refreshes now print one line instead of thirteen; a real deployment log showed 98 catalog lines where 1 was informative.
  
  `publishCatalog` takes an explicit `force` rather than having the caller drop the memo, so a forced round can still tell a genuine change from a routine repeat.
- 914eb43: feat: ship the probe behind a profile, and shout about it in `/status`
  
  `./spotter up --probe` starts the stub detector on a live node, so a real deployment can be tested the way CI tests it. Everything about it is built to be hard to leave on by accident:
  
  - the profile is off by default, and the choice is **not** persisted to `SPOTTER_PROFILES` the way the frontends are — forgetting a frontend is an annoyance, forgetting the probe leaves the property unwatched;
  - the CLI prints a warning on every such start;
  - `PROBE_ENDPOINT` is passed for that command only, so the adapter forgets the probe the moment the profile is dropped;
  - while it is set, the adapter reports `probeActive` on every heartbeat and `/status` prints **🚨 ДЕТЕКТОР ПОДМЕНЁН** above the source figures.
  
  That last one carries the weight: without it, an admin reads "last event a minute ago" as good news, when the event is one we asked for ourselves. A test that reports on a staged detection while claiming the property is watched is worse than no test.
  
  The probe image also joins the release matrix. It is Rust, so changesets never sees it — the version comes from `Cargo.toml`, and it builds from its own directory rather than the repo root.
- Updated dependencies [79f802b]
- Updated dependencies [44487a6]
- Updated dependencies [c797bc6]
- Updated dependencies [56de302]
- Updated dependencies [a07b6a9]
- Updated dependencies [914eb43]
- Updated dependencies [addddbc]
- Updated dependencies [ae90386]
- Updated dependencies [8359b18]
- Updated dependencies [757f521]
- Updated dependencies [b173e32]
- Updated dependencies [523eb3f]
  - stenograph@1.3.0
  - @spotter/transport@1.9.0

## 1.5.0

### Minor Changes

- 49868ba: feat: add silence controls. `/mute` and `/unmute` silence a single chat, and `/nvr_suspend` (ADMIN) suspends the NVR's own notifications through the new `NotificationSuspender` port
- b8b95ff: feat: stop failing long timelapses on the clock. A 12 h deadline (`TIMELAPSE_DEADLINE_HOURS`) and a check against the NVR before giving up, plus live status and a `/timelapse_status` command

### Patch Changes

- Updated dependencies [2b590c2]
- Updated dependencies [0ecd990]
- Updated dependencies [3ed7822]
- Updated dependencies [93d636e]
- Updated dependencies [b389438]
- Updated dependencies [152ccba]
  - @spotter/transport@1.8.0

## 1.4.0

### Minor Changes

- a53eb49: feat: build timelapses over a chosen period
  
  `/timelapse` asks for a camera and a speed with buttons and takes the period as text — `сегодня`, `вчера`, `15.08`, or `15.08 09:00-18:00`. The period is read in the bot's own timezone; parsing it as UTC would have shifted every export by the offset, silently returning the wrong hours.
  
  **Two speeds, not a number.** Frigate's export API accepts exactly `realtime` and `timelapse_25x` — verified against the v0.17.0 source, and the open request for a per-export factor is still unimplemented. What the second one compresses to is set by `record.export.timelapse_args` in the NVR's config and applies globally, so the button says "ускоренно" rather than promising a multiplier this side cannot know.
  
  **An export is not a download.** It re-encodes hours of recordings and runs for minutes, well past the regulator's five-minute reclaim window. Waiting for it inside the request handler would leave the entry pending until the reaper handed it to another consumer, which would start the same export a second time. So the adapter acknowledges as soon as the NVR accepts the job, and a tracker polls it to completion, stages the result into S3 and publishes `spotter.timelapse.ready` — or `.failed` with a reason the user can act on, rather than a message that never updates.
  
  Started exports are recorded on a volume and resumed on startup: a restart mid-encode would otherwise leave the NVR producing a file nobody is waiting for. The forwarder carries the new streams both ways, since on a split deployment the bot and the adapter sit on different nodes. The finished file is fetched from Frigate's nginx — the export record's `video_path` points inside the container — and deleted from the NVR once it is safely in S3.

### Patch Changes

- a53eb49: fix: survive a restart of any other service at any time
  
  Watchtower can restart anything at any moment, so every service has to tolerate every other one disappearing under it. Several could not, and the failures shared one shape: the process stayed alive and the container stayed "running" while the service did nothing at all — so the restart policy never fired and the problem was only visible to users.
  
  **A Redis client that outlives its connection timeout is finished.** Measured against a real server: an outage under ~10s is absorbed by the offline queue and never surfaces, but a longer one puts the client in a state it never leaves — Redis came back and every command still failed, indefinitely. `maxRetries` does not change this; the two configurations were compared directly and neither recovers. Only a new client does, which is why recreating the container was the one thing that ever worked. `RedisConnection` now owns the client and rebuilds it on a dead connection, recovering in about a second, and all sixteen call sites use it.
  
  **A consumer group that disappears never comes back.** A Redis restored without its data answers every `XREADGROUP` with `NOGROUP`, and the read loop retried that forever, once a second, with no possible outcome. The loop now recognises it and recreates the groups.
  
  **A wedged service was indistinguishable from a working one.** No `spotter-*` container had a healthcheck. Each now refreshes a marker file only while Redis actually answers it, so a service that stops working goes stale and gets restarted; a brief blip stays well inside the threshold.
  
  **A clip request did not survive the bot.** The wait lived in memory, so a restart left the "⏳" button frozen with no way to retry even after the video arrived. Waits are persisted and released on startup as a retry.
  
  Depot also sweeps temp directories left by a killed predecessor — each run creates a fresh one, so the orphans accumulated — and gets a 45s stop grace period, since ffmpeg cannot finish inside Docker's default 10s.
- a53eb49: fix: recover the NVR catalog without restarting the adapter
  
  Restarting a cloud service left it showing "неизв. камера" indefinitely, and nothing brought the names back — the only cure found in practice was recreating `spotter-frigate`.
  
  Three things had to line up for that. The `spotter.catalog.<source>` key belongs to the ingest node's Redis and deliberately does not cross the forwarder, so a cloud consumer's `bootstrap` never finds it. Its consumer group is created at `$`, so it only ever sees snapshots published after it started. And the catalog was published exactly once per adapter process — the refresh added earlier only republishes on change, and a camera list that never changes never triggers one, which closed the last route back.
  
  Consumers now ask: `spotter.catalog.request` is answered by the owning adapter with a republish, the forwarder carries it down to the ingest node, and `bootstrap` falls back through the local key, a copy persisted in SQLite, and finally the request. The adapter also force-publishes every few quiet refreshes, so a consumer that missed both still converges within the hour.
- Updated dependencies [a53eb49]
- Updated dependencies [a53eb49]
- Updated dependencies [a53eb49]
  - @spotter/transport@1.6.0

## 1.3.5

### Patch Changes

- e9837f1: feat: recover a snapshot from the recording, and say when there is none
  
  Some events arrived as bare text and nothing explained why. Frigate writes an event snapshot only once tracking ends and it has picked a "best" frame, so an event lasting under a second never gets one — `/api/events/{id}/snapshot.jpg` then answers 404 for good.
  
  Two things were wrong with how that was handled. The 404 was treated as temporary, so the entry was retried five times over roughly 25 minutes, each attempt occupying a worker on an answer that could not change, before landing in the DLQ. `stageMedia` now separates a verdict (404 → the artifact does not exist) from a transient condition (5xx, network, empty body), and a request whose every kind came back absent is reported as final instead of retried. A 404 on one kind while another is merely unavailable still retries, so a missing clip does not cancel a snapshot that is on its way.
  
  Frigate does keep a continuous recording of that moment even when it has no event snapshot, so the adapter now falls back to a frame cut from it — the midpoint of the event, where the object is likelier to be in view. `resolveEventFrame` is optional on `MediaProvider`; adapters without recordings simply omit it and behave as before. The frame carries no bounding box, and retention may already have dropped it, in which case the event is genuinely pictureless.
  
  The message says which of those happened: `📸 В обработке` while the snapshot is on its way, `🙈 Без снимка` once the NVR has ruled it out, and neither once the photo is attached.
  
  Dialog prompts are also removed once answered rather than left in the chat as spent questions.
- Updated dependencies [e9837f1]
  - @spotter/transport@1.5.6

## 1.3.4

### Patch Changes

- 45330ee: fix: keep retrying media the NVR has not written yet, stop retrying timeouts
  
  Two opposite mistakes in how the pipeline judged failure, both visible after the forwarder came back and flushed a backlog.
  
  A staging miss was acked as final. Frigate writes media seconds after an event ends and rate-limits under a burst, so most of those misses were temporary — but the entry was gone, and roughly two thirds of the flushed events never got their snapshot. The adapter now rethrows, leaving the entry pending for the reaper; the `failed` progress report still goes out immediately, so the clip button says why instead of spinning.
  
  An ffmpeg timeout, meanwhile, was marked transient and retried. A timeout means the clip is too long or the machine too slow, so every attempt hits the same wall — five deliveries of the same doomed transcode, each occupying a worker. It is final again, which is what `shouldRetryOnCpu` already assumed. A clip that legitimately needs longer wants a higher `VIDEO_TIMEOUT_MS`, kept below `REDIS_RECLAIM_MIN_IDLE_MS`.
- edbd2d6: fix: notice cameras added in the NVR without restarting the adapter
  
  The catalog was published exactly once per process lifetime. `keepCatalogPublished` retried only until the first snapshot landed and then stopped, and `FrigateCatalog` memoized the `/api/config` response forever, so a camera added in Frigate stayed invisible to the bot until `spotter-frigate` was restarted. The schema comment promised "on start and on change", but nothing implemented the second half.
  
  The loop now keeps going after the first success on a slow interval, and `publishCatalog` compares the serialized snapshot against the last one it sent — an unchanged catalog is not republished, so the refresh does not wake every consumer on a timer. The `/api/config` memo gained a TTL, without which the loop would keep re-reading the same cached answer.
  
  `camera_snapshot` also skipped validation entirely when the catalog was empty: the `cameras.length > 0` guard sat in front of the comparison, so any typed name went straight to the NVR.
- Updated dependencies [edbd2d6]
  - @spotter/transport@1.5.5

## 1.3.3

### Patch Changes

- 313ab95: feat: keep snapshots moving while clips transcode
  
  Every depot replica read one `spotter.media.staged` stream, so a couple of long video transcodes occupied every worker and the snapshots queued behind them — and the snapshot is what makes a notification informative in the first place.
  
  Clips now travel on their own `spotter.media.staged.clip` stream, and `DEPOT_LANE` (`all` | `snapshots` | `clips`) picks what a replica consumes. The split has to happen at the stream level rather than by filtering after the read: a consumer never receives a stream it did not register, so a snapshot-only replica cannot pull a clip out of the shared group and drop it. Camera frames ride the snapshot lane, being equally quick and user-facing. The ingest profile now runs two clip workers plus one snapshot worker; single-node keeps the default `all` and is unchanged.
  
  The clip button also read "Конвертируется…" while the job was still waiting for a free worker. Without a percentage nothing is converting yet, so that state now reads "В очереди…" — ffmpeg reports progress the moment it actually starts.
- Updated dependencies [313ab95]
  - @spotter/transport@1.5.3

## 1.3.2

### Patch Changes

- a96d810: fix: camera list stayed empty until the adapter was restarted
  
  The catalog was published once at startup, so an NVR that was unreachable at that moment left the bot saying "Список камер пока недоступен" indefinitely — and an empty snapshot overwrote a good one. Publishing now retries every minute until the NVR answers, and an empty catalog is never published.

## 1.3.1

### Patch Changes

- 1d88f83: fix: requesting a clip that is not ready duplicated the message
  
  When the NVR had no clip yet, the empty result took the create/update path, whose `editMessageText` cannot edit a message that already carries a photo. The failure threw, the entry was redelivered, and the user saw a second copy of the event without its snapshot while the button hung on "processing". An empty result now only repaints the button, and says the clip may simply not be written yet — a retry a little later usually works. A media artifact the NVR refuses is logged at warn instead of debug, so the reason is visible.

## 1.3.0

### Minor Changes

- 9569cee: feat: real progress for a requested clip
  
  The "Видео" button now moves through its actual stages (запрошено → скачивается → конвертируется) instead of showing one frozen label until the video lands. A clip that fails or takes too long ends with a retry button and the reason, so a stuck request is something the user can act on rather than a spinner that never stops.

### Patch Changes

- Updated dependencies [9569cee]
  - @spotter/transport@1.5.0

## 1.2.1

### Patch Changes

- ec9422d: Answer media requests even when the NVR has nothing to give.
  
  `createMediaController` returned silently when staging produced no keys — the
  NVR 404s an event it no longer has, or never had. Nothing was published, so the
  bot's "Видео обрабатывается…" button stayed that way forever, with no timeout to
  clear it. It now publishes a `MediaProcessed` with no keys, and the bot restores
  the "Видео" button instead of leaving the message stuck.
  
  The empty answer is what `test_delivery` exposed — its synthetic ids exist in no
  NVR — but the same path is hit by real events whose recordings have aged out.
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
