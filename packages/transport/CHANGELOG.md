# @spotter/transport

## 1.9.0

### Minor Changes

- 44487a6: feat: report the NVR's own camera health
  
  Silence from a source cannot tell a quiet driveway from a camera whose stream dropped — but the NVR knows within seconds. The Frigate adapter now polls `/api/stats` in the background and reports, per camera, whether video is arriving and whether the detector sees it. Both appear in `/status`: a dead camera leads the message, and every adapter shows when it last saw an event.
  
  Two distinct faults are separated, because they need different fixes: a camera with no frames at all (the stream is gone) and a camera with frames the detector never sees (video is fine, no event can be produced). A camera with detection deliberately switched off is neither, and is never reported.
  
  State transitions are logged rather than the state itself, so a stream that drops at 02:00 leaves a line saying so instead of one repeated line a minute. A failed probe keeps the last good reading — not being able to ask is not evidence of health.
  
  fix: stop asking Frigate to end a manual event that has a duration
  
  `/event_test real` created the event with a duration, so Frigate closes it itself and refuses the manual end, leaving `has a set duration and can not be ended manually` in the NVR's log on every test run.
- 914eb43: feat: ship the probe behind a profile, and shout about it in `/status`
  
  `./spotter up --probe` starts the stub detector on a live node, so a real deployment can be tested the way CI tests it. Everything about it is built to be hard to leave on by accident:
  
  - the profile is off by default, and the choice is **not** persisted to `SPOTTER_PROFILES` the way the frontends are — forgetting a frontend is an annoyance, forgetting the probe leaves the property unwatched;
  - the CLI prints a warning on every such start;
  - `PROBE_ENDPOINT` is passed for that command only, so the adapter forgets the probe the moment the profile is dropped;
  - while it is set, the adapter reports `probeActive` on every heartbeat and `/status` prints **🚨 ДЕТЕКТОР ПОДМЕНЁН** above the source figures.
  
  That last one carries the weight: without it, an admin reads "last event a minute ago" as good news, when the event is one we asked for ourselves. A test that reports on a staged detection while claiming the property is watched is worse than no test.
  
  The probe image also joins the release matrix. It is Rust, so changesets never sees it — the version comes from `Cargo.toml`, and it builds from its own directory rather than the repo root.
- addddbc: fix: answer `/test`, including when it refuses
  
  The adapter now publishes the outcome of every probe request to `spotter.probe.result`, and the bot delivers it to the chat that asked — a refusal with its reason, or a confirmation naming the camera and frame count.
  
  Without this the command was quietly broken in exactly the way it exists to catch. A refusal reached only the adapter's log on the ingest node, so an admin running `/test` on a deployment with no probe saw a cheerful "staging a detection" and then nothing at all — indistinguishable from the outage the command is meant to detect. The reply itself crosses the forwarder, or the same silence would return on any split deployment.
  
  `/test` also stops claiming success before the adapter has spoken, and the refusal reasons now say what to do (`./spotter up --probe`) rather than describing the internals.
  
  Adds `docs/testing.md`: the three levels of checking, what `/test` covers, and the two steps a live node needs before it works — the probe profile, and pointing Frigate's own detector config at it.
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
- 523eb3f: feat: replace `/test_delivery` and `/test_media` with a single `/test`
  
  `/test [камера] [объект]` publishes to `spotter.probe.request.<source>`; the adapter arms the probe, and the NVR does the rest — it sees the object, tracks it, records the clip and publishes the event itself. What arrives in Telegram came the whole way round.
  
  The two old commands seeded `spotter.event.test_seed`, which skipped MQTT entirely: they proved our idea of an event, never the NVR's. The stretch they skipped is the one that went silent for two days in production while both commands kept passing. `test_seed`, `eventTestController` and `eventTestAction` are gone, and the forwarder now carries the probe request in their place — without that, `/test` on a cloud node could never reach an adapter on ingest.
  
  `PROBE_ENDPOINT` is empty by default and stays empty in production: the probe replaces the NVR's detector, so a request with no probe configured is refused with a reason rather than silently doing nothing.

### Patch Changes

- c797bc6: test: close the NVR rig's chain through the adapter into Redis
  
  The rig now runs our own adapter image beside Frigate, so a `/detect` call is followed all the way: probe → Frigate's detector → its tracker → MQTT → the adapter → `spotter.event`. The score handed to the probe comes back out of Redis unchanged, which is the one thing seeding `spotter.event.test_seed` can never show.
  
  Adds minio (the adapter refuses to start without S3) and `bun run nvr:build` for the adapter image. Five tests, ~107s from a cold start.
- 56de302: test: make the NVR rig actually produce events, verified against Frigate 0.17.2
  
  The rig now runs end to end: Frigate connects to the broker, polls the probe for every analysed frame, and on `/detect` opens, tracks and closes events of its own — `frigate/events` carries the real `before`/`after` payload with the score we asked for, and the NVR's own database records them.
  
  Four fixes, each found by running it and each invisible without a real NVR:
  
  - `detect.enabled` is explicit. It defaults to `false` in 0.17, so the camera captured fine while never calling the detector.
  - `record.retain` becomes `record.continuous.days`. The old key is rejected outright in 0.17, and Frigate answers an invalid config by starting in safe mode with a CPU detector — a healthy-looking NVR that simply never calls the probe.
  - No comments inside `go2rtc.streams`. Frigate copies that block into go2rtc's config verbatim, and a comment between the key and its list leaves the stream registered with no producer running, so Frigate 404s against its own restream.
  - The source clip is 20 minutes rather than 30 seconds. go2rtc's `#loop` ends at EOF and `#input=` flags land after the output URL where ffmpeg rejects them, so a file longer than any run is the honest fix.
  
  The config mount is writable (Frigate migrates its own config across versions) and the rig's ports move off 5000/8554, which collide with AirPlay and with a developer's own Frigate.
- a07b6a9: test: drive a real Frigate from the probe in its own rig
  
  Adds `.e2e/nvr/`: a pinned Frigate `0.17.2`, a real broker, and the probe as its detector, with `bun run test:nvr` asserting the NVR connects to MQTT, polls the detector, and publishes an event of its own making. That hop — NVR to broker to adapter — was covered by nothing, and it is the one that went silent in production for two days while every seeded test stayed green.
  
  Separate from smoke on purpose: smoke stays light against a fake NVR, this pays a ~500MB image for an answer smoke cannot give. It skips itself when docker or the image is absent.
  
  The probe's healthcheck moves into its image, and it now asks `127.0.0.1` rather than `localhost` — alpine resolves the name to `::1` first, where nothing listens, so the check could never pass and would have held Frigate at the starting line with no hint why. The image also builds from the committed `Cargo.lock` instead of resolving fresh versions.
- ae90386: test: follow an event all the way to a recipient's chat
  
  The rig now covers the last stretch, the one a seeded event could never reach: the domain mints a code, the fake Bot API hands the bot a real `/login` message as though a person typed it, the code is redeemed, and a detection staged on the NVR arrives as a message in that chat.
  
  Without the ability to put words in a user's mouth this was untestable — no recipient exists until someone redeems a code from a genuine chat, and with no recipient an event has nowhere to go. The stand-in gained a `/__send` endpoint for exactly that.
  
  The rig also brings up the PWA, so `/user_sign`'s one-tap login link is exercised against a real instance announcing its own address.
  
  `compose up` now passes `--build`. A four-hour-old image of the Bot API stand-in is what made the first delivery run fail: compose happily reused it, and the test ran against code that was not the code in the tree.
- b173e32: feat: add `spotter-probe`, a stub detector that drives a real Frigate
  
  Frigate has no hook for creating an event, but its supported `zmq_ipc` detector plugin asks an external process what is in each frame. The probe answers that on demand, so the NVR itself does the tracking, the recording, the severity and the MQTT publishing — the whole path `test_delivery` and `test_media` skip by writing straight to `spotter.event.test_seed`.
  
  Written in Rust, the only service in the repo that is not Bun: the ZeroMQ binding panics under Bun (`unsupported uv function: uv_async_init`), and a second JS runtime beside Bun invites someone to write a service on it. A pure-Rust ZMQ implementation keeps the image at 9.65 MB with no runtime at all, and everything builds inside Docker so no toolchain reaches a developer machine or a node.
- Updated dependencies [79f802b]
  - stenograph@1.3.0

## 1.8.1

### Patch Changes

- c639989: fix: stop 500-ing the PWA login. A request without a usable `Host` header broke static serving with `Invalid URL`, and the server answered 500. `CommandBus` no longer spins a hot loop while Redis loads its AOF

## 1.8.0

### Minor Changes

- 49868ba: feat: add silence controls. `/mute` and `/unmute` silence a single chat, and `/nvr_suspend` (ADMIN) suspends the NVR's own notifications through the new `NotificationSuspender` port
- 152a587: feat: report queue depth in the heartbeat and show it in `/status`: how many entries are waiting, how many are in flight, and the age of the oldest unacked one
- 98a2893: feat: bound table growth. Events, dedup ledgers and message links are trimmed by age, and access codes now expire (`ACCESS_CODE_TTL_HOURS`, a day by default)
- 86b3270: feat: filter delivery by the NVR's own verdict. The adapter reads `frigate/reviews` and stamps `severity` on the event, and `DELIVERY_POLICY=alerts` keeps pushes for alerts only
- 4f28b4b: refactor: reduce the role vocabulary and username normalisation to a single definition in `@spotter/transport`, so access checks in server and telegram no longer rely on local copies of `ROLE_RANK`
- b8b95ff: feat: stop failing long timelapses on the clock. A 12 h deadline (`TIMELAPSE_DEADLINE_HOURS`) and a check against the NVR before giving up, plus live status and a `/timelapse_status` command

## 1.7.0

### Minor Changes

- 6fb558c: feat: make the PWA a real client, not a read-only feed
  
  The PWA could show events and nothing else. It published nothing to the bus, so every action the bot offers — a camera snapshot, a clip, the camera list, service status — simply did not exist there. What blocked all of them was the same missing piece: a way to send a command and hear back.
  
  `CommandBus` was telegram-local despite depending on nothing telegram-specific, so it moves to `@spotter/transport` alongside `HeartbeatRegistry` and a role vocabulary that was already copied into two services and about to be copied into a third.
  
  **Access is granted once, not once per frontend.** A device now redeems a code through the domain (`device.redeem`) from the same pool `/user_sign` mints for the bot, and gets back the real role the server enforces on every later command. Previously the PWA checked codes against a local `PWA_ACCESS_CODES` list that carried no role at all — which is why nothing beyond reading could have worked even with a channel. A code minted for a named Telegram user is refused: there is no username on a device to match it against, and honouring it would hand a personal code to whoever typed it first.
  
  An authorized install lives in its own `devices` table rather than hanging off a push subscription: being authorized is a redeemed code, not permission to send notifications, and browsers rotate a push endpoint without the user doing anything. A role change or revocation reaches the device over `spotter.delivery.recipient`, so a demoted user stops being offered buttons that would only fail.
  
  The feed is now behind the same token. It carries snapshots of the house, and serving it to anyone who knows the URL was never intended.

### Patch Changes

- 714cf4e: fix: recover when Redis disappears mid-read
  
  A consumer could stop consuming for good and give no sign of it. Restarting the Redis *container* — an image update, not a blip — left every service alive, healthy to every check, and reading nothing. Events piled up in the streams with nobody to take them.
  
  The cause was not the missing consumer groups the earlier fix addressed. A blocking `XREADGROUP` already in flight when the server dies never settles at all: it neither resolves nor rejects, so the read loop parks on the `await` forever. No error is raised, which is why the NOGROUP recovery never ran — it was never reached. The healthcheck could not see it either, since its `PING` runs on a different connection that reconnects perfectly well.
  
  The read now carries a deadline of `BLOCK` plus a grace margin, turning silence into an error the loop can act on: the connection is replaced, and the existing NOGROUP branch then recreates the groups the restarted Redis lost. Measured against a real container, recovery goes from never to a few seconds, and the whole sequence is visible in the log.
  
  Found by the new end-to-end suite, which was written expecting a different bug.
- 044e6ae: docs: rewrite the README for people, not machines
  
  The README read like a specification: architecture diagrams above the fold, a stream inventory, release mechanics. Everything true, nothing that answers the first question a visitor has — what does this do for me, and why would I run it.
  
  It now opens on the thing itself: a person walks through the yard, and seconds later the phone shows which camera, who, and a frame. Then why you would want it over the alternatives, what it looks like in use, and an install that fits in three lines. Badges, a comparison table and the feature tour follow the conventions of the self-hosted projects people actually adopt.
  
  The reference material was moved rather than dropped: the stream inventory now lives in `AGENTS.md` beside the rest of the technical detail, where it is also easier to keep honest.
  
  Docs were audited against the code in the same pass. `CommandBus` and `HeartbeatRegistry` had moved to `@spotter/transport` but the telegram docs still pointed at deleted files; the PWA's `devices` and `timelapses` tables and the timelapse streams were undocumented; the command tables predated the e2e and smoke suites. Every link in the live docs now resolves.
- fdd83e2: test: end-to-end suite over a real bus and both deployment shapes
  
  Unit tests kept passing while the product broke, because what breaks is the wiring between services — a stream nobody mirrors, a consumer group that never comes back — and none of that exists inside a single service.
  
  The suite runs the services' real controllers against a real Redis in Docker, in both shapes Spotter is deployed in: one node, and ingest+cloud bridged by the forwarder. The split shape matters most — it uses the forwarder's own stream map, so a stream left out of it fails here exactly as in production, by silently never arriving. Only what we do not own is faked: the NVR, S3, Telegram and web-push. Without Docker the suite skips rather than fails, so `bun test` stays green anywhere.
  
  Writing it immediately turned up a defect that the earlier reliability work missed. Losing Redis entirely — `docker rm -f` on the container, which is what an image update does — leaves consumers stuck for good: the producer keeps publishing, events pile up, nothing reads them. A `FLUSHALL` recovers, because the connection survives and the NOGROUP branch recreates the groups; destroying the container does not. The reproduction is committed as a `test.failing` rather than deleted to keep the suite green, and the measurements are in `.e2e/README.md`.
  
  What this level cannot see: every service's `index.ts` ends in `process.exit`, so the process shell itself is not exercised, and errors in Dockerfiles, env or compose stay invisible to it.
- 18a45ec: test: compose-level smoke over the real images
  
  The in-process suite composes controllers and never starts a container, so a whole category of failure was invisible to it: a broken Dockerfile, a missing environment variable, a healthcheck that never goes green, a service that cannot reach a dependency by container name. Those are deployment bugs, and they only appear at deployment.
  
  The smoke brings up both shapes — single-node, and ingest+cloud bridged by the forwarder — from the same Dockerfiles that ship, on a real Redis, MinIO and mosquitto, with real migrations. Only the NVR is faked, as a container the services reach by name like any other. It checks that every service becomes healthy on its own healthcheck, that none crash-loops, that the adapter reaches the NVR and publishes its catalog, and that the catalog arrives at the domain — which on the split shape holds only if the forwarder really carries the stream.
  
  `spotter-telegram` is deliberately excluded: grammY is built with a bare token and no `apiRoot`, so the container would dial api.telegram.org for real. Adding production configuration solely to make a test possible is the wrong trade, and the bot's logic is already covered in-process.
  
  Kept out of `bun test` — it takes minutes and needs images built first (`bun run smoke:build`, then `bun run test:smoke`). Without them it skips with a hint rather than failing.

## 1.6.0

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

## 1.5.6

### Patch Changes

- e9837f1: fix: do not let an example's `# hint` become a config value
  
  The `.env` examples annotate their settings inline (`VIDEO_CODEC=hevc # h264 | hevc`). Both Bun's `--env-file` and compose's `env_file` strip that before the process sees it, so this was never breaking a normal deployment — but a value injected any other way (compose `environment:`, a shell export, CI) is passed through verbatim, and the hint silently becomes the value, failing enum validation and falling back to a default without a word.
  
  `env.enum`, `env.number`, `env.boolean` and `env.stringArray` now drop a trailing hint themselves. `env.string` deliberately does not: it carries secrets and URLs, where a hash is a legitimate character and truncating one would be worse than the problem being guarded against. Only a hash preceded by whitespace counts, so a URL fragment survives either way.
  
  The examples no longer carry inline hints at all — the option lists moved to the line above, where no parser has to be trusted — and `install.ts` strips any that remain when it generates a real `.env`.

## 1.5.5

### Patch Changes

- edbd2d6: fix: notice cameras added in the NVR without restarting the adapter
  
  The catalog was published exactly once per process lifetime. `keepCatalogPublished` retried only until the first snapshot landed and then stopped, and `FrigateCatalog` memoized the `/api/config` response forever, so a camera added in Frigate stayed invisible to the bot until `spotter-frigate` was restarted. The schema comment promised "on start and on change", but nothing implemented the second half.
  
  The loop now keeps going after the first success on a slow interval, and `publishCatalog` compares the serialized snapshot against the last one it sent — an unchanged catalog is not republished, so the refresh does not wake every consumer on a timer. The `/api/config` memo gained a TTL, without which the loop would keep re-reading the same cached answer.
  
  `camera_snapshot` also skipped validation entirely when the catalog was empty: the `cameras.length > 0` guard sat in front of the comparison, so any typed name went straight to the NVR.

## 1.5.4

### Patch Changes

- 56c21b1: fix: survive a Redis restart instead of dying on it
  
  A durable Redis replaying its AOF answers every command with `-LOADING` until it finishes. `XGROUP CREATE` treated that as fatal, so `run()` rejected and the process exited — the forwarder died on exactly the restart its store-and-forward buffer exists to survive, and needed a manual recreate to come back.
  
  Group creation now waits `-LOADING` out (up to two minutes) while any other error still fails fast. The Redis healthchecks were complicit and are fixed too: `redis-cli` exits 0 even on an error reply, so a bare `ping` reported healthy mid-load; they now grep for `PONG`.

## 1.5.3

### Patch Changes

- 313ab95: feat: keep snapshots moving while clips transcode
  
  Every depot replica read one `spotter.media.staged` stream, so a couple of long video transcodes occupied every worker and the snapshots queued behind them — and the snapshot is what makes a notification informative in the first place.
  
  Clips now travel on their own `spotter.media.staged.clip` stream, and `DEPOT_LANE` (`all` | `snapshots` | `clips`) picks what a replica consumes. The split has to happen at the stream level rather than by filtering after the read: a consumer never receives a stream it did not register, so a snapshot-only replica cannot pull a clip out of the shared group and drop it. Camera frames ride the snapshot lane, being equally quick and user-facing. The ingest profile now runs two clip workers plus one snapshot worker; single-node keeps the default `all` and is unchanged.
  
  The clip button also read "Конвертируется…" while the job was still waiting for a free worker. Without a percentage nothing is converting yet, so that state now reads "В очереди…" — ffmpeg reports progress the moment it actually starts.

## 1.5.2

### Patch Changes

- f6ff724: refactor: share CatalogCache and catalogController from transport
  
  The catalog controller was byte-identical in telegram, pwa and email, and four near-identical `CatalogCache` copies had already started drifting apart in comments and helpers. Both now live in `@spotter/transport`, where the rest of the catalog contract already sits, so a change to label resolution is one edit instead of four.
- f6ff724: fix: retry transient media failures instead of acking them away
  
  A failed transcode was indistinguishable from a broken clip: `mediaStagedAction` caught every error, returned empty, and the controller published `media_processed` — so the regulator acked. An S3 blip or a not-yet-visible staged object therefore lost the media for good, bypassing the PEL/reaper/DLQ machinery entirely. S3 reads/writes and ffmpeg timeouts now raise `TransientError` and propagate, leaving the entry pending for the reaper; only genuinely broken media (bad codec, unreadable input) still reports a final miss. Clip and snapshot are judged independently, so a permanent failure of one does not hold back the other.
  
  The dead-letter boundary was also off by one: `deliveries > maxDeliveries` granted a sixth attempt against a documented budget of five, which for a transcode is a wasted full run.

## 1.5.1

### Patch Changes

- 9552750: feat: show transcoding progress on the video button
  
  The button sat on "Конвертируется…" for the whole encode, which on a long clip is indistinguishable from a hang. Depot already had the percentage in its logs, so it now travels on `spotter.media.progress` and the button reads "Конвертируется… 40%". Updates are rounded down to tens and only sent when the number moves, keeping it to at most ten edits per clip; a broken publish is swallowed, since progress must never fail a transcode.

## 1.5.0

### Minor Changes

- 9569cee: feat: real progress for a requested clip
  
  The "Видео" button now moves through its actual stages (запрошено → скачивается → конвертируется) instead of showing one frozen label until the video lands. A clip that fails or takes too long ends with a retry button and the reason, so a stuck request is something the user can act on rather than a spinner that never stops.

## 1.4.0

### Minor Changes

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

## 1.3.0

### Minor Changes

- 52344b5: New PWA frontend (`apps/pwa`): the primary delivery frontend — an installable
  Progressive Web App plus a thin single-process Bun server. It consumes
  `spotter.delivery.event` and sends **Web Push** (VAPID, via `web-push`) to
  subscribed devices, and serves the web app itself (Vite + React 19 + shadcn/ui +
  Tailwind v4). One codebase pushes to iPhone / Android / desktop — no App Store,
  no Apple account.

  Server: `Bun.serve` (static + SPA fallback + REST API + `RedisRegulator`),
  `PushGateway` (VAPID configured at boot, 404/410 subscriptions pruned on
  fan-out), and a per-camera `PushCoalescer` that collapses event storms into one
  "N событий" push. Dedup (level 1): push only on `create`, atomic
  `notified_events` claim (same pattern as `apps/email`, released on failure so
  the regulator retries), server-side `topic` + client-side `tag` for
  double-guarded notification coalescing. SQLite/drizzle holds push subscriptions,
  the dedup ledger and a rolling `recent_events` feed cache.

  UI: dark-first, three screens — Feed (day-grouped list with skeletons, empty /
  error / realtime states), Event (media hero, metadata, fullscreen snapshot
  dialog) and Setup (progressive-disclosure onboarding: install → notification
  permission → one-time code, plus device management). Own lightweight
  History-API router and theme hook (no extra deps). Custom service worker
  (`injectManifest`, online-only, no precache): `push` → notification, click →
  deep-link, and posts to open tabs so the feed refreshes live. VAPID public key
  is delivered at runtime via `GET /api/vapid`, so one build works for any
  deployer. Device authorization is a local one-time-code check in v1
  (`PWA_ACCESS_CODES`).

  `@spotter/transport` gains a shared, channel-agnostic event renderer
  (`renderEvent` / `renderEventTiming` / `renderEventTime`) now used by both `pwa`
  and `email` (email dropped its private copy; the >24h duration formatting bug is
  fixed in the shared version), and `redactConfig` now masks `private`-named keys
  (e.g. the VAPID private key). Ships `.env.pwa.example`, an optional (commented)
  service in `production.cloud.yml` (requires HTTPS), and per-app `AGENTS.md`.

## 1.2.0

### Minor Changes

- 6fcfb86: Architectural refactoring

### Patch Changes

- Updated dependencies [6fcfb86]
  - stenograph@1.2.0

## 1.1.0

### Minor Changes

- 538fb94: Full project architecture rework

### Patch Changes

- Updated dependencies [538fb94]
  - stenograph@1.1.0

## 1.0.2

### Patch Changes

- d7e607b: fix: User authorization caching. DayJS removed

## 1.0.1

### Patch Changes

- d18442e: fix: stenograph log levels prefixes changed. Prisma schema file moved to root directory
