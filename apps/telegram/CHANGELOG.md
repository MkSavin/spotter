# @spotter/telegram

## 1.8.1

### Patch Changes

- 8039180: fix: say when an event has no video, instead of silently dropping the button
  
  The "🎬 Видео" button appears only when the NVR closes an event with `has_clip` set. When it does not, the button was simply absent, which is indistinguishable from a broken bot — and the reader has no way to tell that the NVR itself decided there was nothing to offer.
  
  An ended event without a clip now carries `🎞️ Без видео` on its label line. The film reel is deliberately not the button's clapperboard and not the snapshot's `📸`/`🙈`: the clip and the snapshot are independent axes, and an event can lack both, so the marks have to read apart at a glance.
  
  The mark tracks the truth rather than the flag: a clip that arrives anyway clears it, while a delivered snapshot leaves it standing, since a photo says nothing about the video.
  
  `shouldOfferClip` gated the button and had no tests at all. It now has them, alongside its new counterpart `shouldSayClipless`, including a case asserting the two can never both hold — a message must never offer a button while claiming there is nothing to offer.
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

## 1.8.0

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
- da69e7a: feat: hand the access code to the web app in one tap
  
  `/user_sign` now prints the code on its own line, with nothing else inside the tag: a tap copies exactly what the web app's field expects. It used to be wrapped as `/login <code>`, so copying brought the command along and it had to be edited out by hand — in the app where the code is least convenient to retype.
  
  Where a PWA is running, the message also carries `…/authorize?code=…`. Opening it fills the code in and submits it, then strips it from the address bar with `replaceState`: the code is single use and has nothing to gain from sitting in history, a bookmark, or a screenshot. An install that is already signed in drops the code the same way rather than leaving it in the URL, since the login page never renders there.
  
  The bot learns the address from the PWA's own heartbeat (`details.url`, from `PUBLIC_URL`) rather than a second copy in its own config, which would drift the first time one of them moved. No PWA, a silent one, or a code bound to a `@username` — which a device can never redeem — means no link offered.
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
- 1bd6a85: feat: let the Bot API be pointed elsewhere, and run the bot in the rig
  
  `TELEGRAM_API_ROOT` sends every grammY call to a given host, and `TELEGRAM_TEST_ENVIRONMENT` switches to Telegram's own test infrastructure. Both are empty by default, so production is unchanged, and the bot warns loudly on startup whenever either is set — a redirected bot that looks normal in the logs is worse than no rig at all.
  
  This is not a knob invented for a test: it is what a self-hosted Bot API server needs, and what Telegram's separate test infrastructure needs. Declining to add it was the wrong call.
  
  The NVR rig now runs `spotter-server` and `spotter-telegram` against a recording Bot API stand-in, so a run exercises the whole deployment and still cannot message a real chat. `/__calls` serves what the bot tried to send.
  
  Delivery to an actual recipient stays uncovered: registration goes through a signed token and a live chat, which is its own piece of work.
- 523eb3f: feat: replace `/test_delivery` and `/test_media` with a single `/test`
  
  `/test [камера] [объект]` publishes to `spotter.probe.request.<source>`; the adapter arms the probe, and the NVR does the rest — it sees the object, tracks it, records the clip and publishes the event itself. What arrives in Telegram came the whole way round.
  
  The two old commands seeded `spotter.event.test_seed`, which skipped MQTT entirely: they proved our idea of an event, never the NVR's. The stretch they skipped is the one that went silent for two days in production while both commands kept passing. `test_seed`, `eventTestController` and `eventTestAction` are gone, and the forwarder now carries the probe request in their place — without that, `/test` on a cloud node could never reach an adapter on ingest.
  
  `PROBE_ENDPOINT` is empty by default and stays empty in production: the probe replaces the NVR's detector, so a request with no probe configured is refused with a reason rather than silently doing nothing.

### Patch Changes

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

## 1.7.1

### Patch Changes

- a7cb74d: fix: make the `sent_at` migration work on a populated table — SQLite rejects a non-constant DEFAULT in `ALTER TABLE ADD COLUMN` once the table has rows

## 1.7.0

### Minor Changes

- 1df6899: feat: rate-limit commands that reach the NVR. A repeat in the same chat is dropped (3 s by default, 60 s for `/timelapse`); commands that only read local state stay unthrottled
- 49868ba: feat: add silence controls. `/mute` and `/unmute` silence a single chat, and `/nvr_suspend` (ADMIN) suspends the NVR's own notifications through the new `NotificationSuspender` port
- 152a587: feat: report queue depth in the heartbeat and show it in `/status`: how many entries are waiting, how many are in flight, and the age of the oldest unacked one
- 98a2893: feat: bound table growth. Events, dedup ledgers and message links are trimmed by age, and access codes now expire (`ACCESS_CODE_TTL_HOURS`, a day by default)
- 6a348ed: feat: let `/user_sign` pick a role (VIEWER by default), and have the PWA say why a code was refused instead of the blanket "invalid or already used"
- b8b95ff: feat: stop failing long timelapses on the clock. A 12 h deadline (`TIMELAPSE_DEADLINE_HOURS`) and a check against the NVR before giving up, plus live status and a `/timelapse_status` command

### Patch Changes

- bae64c6: chore: drop the `PRAGMA foreign_keys` that enforced nothing — no schema declares a foreign key, and SQLite cannot check relations that span services
- af04358: fix: correct the duration of events longer than a day — a copy of `renderEventTiming` took hours modulo 60 and rendered "1 дней 25 ч"
- 4f28b4b: refactor: reduce the role vocabulary and username normalisation to a single definition in `@spotter/transport`, so access checks in server and telegram no longer rely on local copies of `ROLE_RANK`
- Updated dependencies [2b590c2]
- Updated dependencies [0ecd990]
- Updated dependencies [3ed7822]
- Updated dependencies [93d636e]
- Updated dependencies [b389438]
- Updated dependencies [152ccba]
  - @spotter/transport@1.8.0

## 1.6.1

### Patch Changes

- 2a4d678: chore: upgrade the runtime to Bun 1.4
- 6fb558c: feat: make the PWA a real client, not a read-only feed
  
  The PWA could show events and nothing else. It published nothing to the bus, so every action the bot offers — a camera snapshot, a clip, the camera list, service status — simply did not exist there. What blocked all of them was the same missing piece: a way to send a command and hear back.
  
  `CommandBus` was telegram-local despite depending on nothing telegram-specific, so it moves to `@spotter/transport` alongside `HeartbeatRegistry` and a role vocabulary that was already copied into two services and about to be copied into a third.
  
  **Access is granted once, not once per frontend.** A device now redeems a code through the domain (`device.redeem`) from the same pool `/user_sign` mints for the bot, and gets back the real role the server enforces on every later command. Previously the PWA checked codes against a local `PWA_ACCESS_CODES` list that carried no role at all — which is why nothing beyond reading could have worked even with a channel. A code minted for a named Telegram user is refused: there is no username on a device to match it against, and honouring it would hand a personal code to whoever typed it first.
  
  An authorized install lives in its own `devices` table rather than hanging off a push subscription: being authorized is a redeemed code, not permission to send notifications, and browsers rotate a push endpoint without the user doing anything. A role change or revocation reaches the device over `spotter.delivery.recipient`, so a demoted user stops being offered buttons that would only fail.
  
  The feed is now behind the same token. It carries snapshots of the house, and serving it to anyone who knows the URL was never intended.
- 7a2849c: fix: accept multi-day timelapse periods and stop the dialog freezing
  
  `28.08 09:00 - 31.08 22:00` did nothing at all. Two separate faults met on that input.
  
  The period parser only ever understood a window inside a single day, so anything spanning midnight was rejected. It now takes a date on each side — `28.08 09:00 - 31.08 22:00`, or `28.08-31.08` for whole days — and `позавчера` joins the named days.
  
  Worse, the rejection was invisible. A dialog step that takes only buttons had no text handler, and the engine passed the message on instead of answering it: no error, no progress, nothing to react to. Since the speed step is button-only, a typed answer there vanished and the dialog looked frozen. Any step without a text handler now replies rather than staying silent, which fixes the whole class rather than this one command.
  
  Common periods are offered as buttons — last 24 hours, today, the two days before it, last 6 hours. Each label carries the actual date instead of the word behind it, because "вчера" read a day later means a different day, and an export runs for minutes before anyone finds out it covered the wrong one.
- Updated dependencies [6fb558c]
- Updated dependencies [714cf4e]
- Updated dependencies [044e6ae]
- Updated dependencies [fdd83e2]
- Updated dependencies [18a45ec]
  - @spotter/transport@1.7.0

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
- Updated dependencies [a53eb49]
- Updated dependencies [a53eb49]
- Updated dependencies [a53eb49]
  - @spotter/transport@1.6.0

## 1.5.8

### Patch Changes

- e9837f1: feat: recover a snapshot from the recording, and say when there is none
  
  Some events arrived as bare text and nothing explained why. Frigate writes an event snapshot only once tracking ends and it has picked a "best" frame, so an event lasting under a second never gets one — `/api/events/{id}/snapshot.jpg` then answers 404 for good.
  
  Two things were wrong with how that was handled. The 404 was treated as temporary, so the entry was retried five times over roughly 25 minutes, each attempt occupying a worker on an answer that could not change, before landing in the DLQ. `stageMedia` now separates a verdict (404 → the artifact does not exist) from a transient condition (5xx, network, empty body), and a request whose every kind came back absent is reported as final instead of retried. A 404 on one kind while another is merely unavailable still retries, so a missing clip does not cancel a snapshot that is on its way.
  
  Frigate does keep a continuous recording of that moment even when it has no event snapshot, so the adapter now falls back to a frame cut from it — the midpoint of the event, where the object is likelier to be in view. `resolveEventFrame` is optional on `MediaProvider`; adapters without recordings simply omit it and behave as before. The frame carries no bounding box, and retention may already have dropped it, in which case the event is genuinely pictureless.
  
  The message says which of those happened: `📸 В обработке` while the snapshot is on its way, `🙈 Без снимка` once the NVR has ruled it out, and neither once the photo is attached.
  
  Dialog prompts are also removed once answered rather than left in the chat as spent questions.
- Updated dependencies [e9837f1]
  - @spotter/transport@1.5.6

## 1.5.7

### Patch Changes

- edbd2d6: feat: ask for command arguments step by step instead of erroring
  
  Telegram's command menu launches a command with no arguments and offers no way to add them first, so every command that required one answered the menu with "Неверный список аргументов" — the standard way of invoking it was guaranteed to fail.
  
  Missing arguments are now collected one question at a time: buttons where the set of values is known (cameras from the catalog, roles, users already bound locally), a typed reply where it is not. Typing the whole thing still works, and a partial command only asks for the rest — `/user_promote @vasya` goes straight to the role. Commands declare arguments as data, so the parser, the validation, the keyboard and the printed signature all come from one place and cannot drift apart.
  
  The dialog engine is deliberately general rather than a one-off for arguments — steps, pagination, back, cancel, TTL and stale-keyboard handling live in `dialog/`, and argument collection is one definition on top of it. `@grammyjs/conversations` would have been the obvious choice, but its replay model requires wrapping every side effect in `conversation.external()`, which here means nearly every line of the existing handlers, plus reinstalling `hydrate`/`parse-mode` inside each conversation and reaching sessions indirectly.
  
  Progress is kept in SQLite, so a restart mid-wizard resumes where the user left off instead of discarding the answers. The TTL runs from the last reply rather than the start, since a wizard that survives restarts can legitimately stay open a while. Storage failures are logged and swallowed: durability must not cost the conversation.
  
  Fixes found while auditing the result: completing a dialog re-checks the caller's role, since a dialog outlives the request that opened it and a revoked admin would otherwise still execute the command; user-supplied values are escaped before going into HTML, as an unescaped `<` made Telegram reject the whole reply and the user saw nothing at all; and an optional argument now opts in to being asked with `ask`, which makes `user_sign`'s prompt reachable while leaving `test_media` and `test_delivery` on their defaults.
- Updated dependencies [edbd2d6]
  - @spotter/transport@1.5.5

## 1.5.6

### Patch Changes

- 313ab95: feat: keep snapshots moving while clips transcode
  
  Every depot replica read one `spotter.media.staged` stream, so a couple of long video transcodes occupied every worker and the snapshots queued behind them — and the snapshot is what makes a notification informative in the first place.
  
  Clips now travel on their own `spotter.media.staged.clip` stream, and `DEPOT_LANE` (`all` | `snapshots` | `clips`) picks what a replica consumes. The split has to happen at the stream level rather than by filtering after the read: a consumer never receives a stream it did not register, so a snapshot-only replica cannot pull a clip out of the shared group and drop it. Camera frames ride the snapshot lane, being equally quick and user-facing. The ingest profile now runs two clip workers plus one snapshot worker; single-node keeps the default `all` and is unchanged.
  
  The clip button also read "Конвертируется…" while the job was still waiting for a free worker. Without a percentage nothing is converting yet, so that state now reads "В очереди…" — ffmpeg reports progress the moment it actually starts.
- b852ae0: fix: stop sending an event several times to the same chat
  
  Two defects compounded into duplicate messages (seen on event `oemp2q`, delivered three times).
  
  Frigate's `new` event was being dropped by the zero-movement guard — the NVR genuinely reports `position_changes: 0` on `new`, and 1798 events hit that path in a single log. Without a `start` the frontend never records a message id, so every later delivery took the "no message yet" branch and sent a fresh one. The guard now applies only to mid-life `update`s, where it was actually aimed.
  
  Then `event_messages` was persisted with a delete-then-insert, so a delivery whose sends all failed wrote an empty list and erased the chats that had already been messaged. The retry no longer recognised them and sent again. Persistence is now an additive upsert (`record`), with removal split out into an explicit `forget`.
- Updated dependencies [313ab95]
  - @spotter/transport@1.5.3

## 1.5.5

### Patch Changes

- f6ff724: refactor: share CatalogCache and catalogController from transport
  
  The catalog controller was byte-identical in telegram, pwa and email, and four near-identical `CatalogCache` copies had already started drifting apart in comments and helpers. Both now live in `@spotter/transport`, where the rest of the catalog contract already sits, so a change to label resolution is one edit instead of four.
- f6ff724: refactor: read config through resolveConfig and cover the untested paths
  
  `transcode.ts` read eleven env vars at module scope, so the values froze at import time, skipped the redacted startup dump and could not be swapped in tests — which is why the largest file in the repo had the thinnest coverage. They now belong to `config.video`/`config.image` and arrive as an argument.
  
  Test coverage follows the same reasoning: `CommandBus` (RPC correlation, timeout, replies addressed to another replica, junk on the stream) had none despite driving the whole "Видео" button flow, so its timeouts became injectable and it is now covered. The frigate test-seed controller's id/timestamp derivation moved into a pure `resolveEventTestPayload`, and the dead-letter boundary gained a test that pins the exact threshold.
- Updated dependencies [f6ff724]
- Updated dependencies [f6ff724]
  - @spotter/transport@1.5.2

## 1.5.4

### Patch Changes

- 9552750: feat: show transcoding progress on the video button
  
  The button sat on "Конвертируется…" for the whole encode, which on a long clip is indistinguishable from a hang. Depot already had the percentage in its logs, so it now travels on `spotter.media.progress` and the button reads "Конвертируется… 40%". Updates are rounded down to tens and only sent when the number moves, keeping it to at most ten edits per clip; a broken publish is swallowed, since progress must never fail a transcode.
- Updated dependencies [9552750]
  - @spotter/transport@1.5.1

## 1.5.3

### Patch Changes

- dbb2afa: fix: install only the dependencies each image actually uses
  
  Every Dockerfile ran an unfiltered `bun install`, so each backend image downloaded the PWA's frontend toolchain — vite, tailwind and lightningcss's native prebuilds. The arm64 leg then failed extracting `lightningcss-linux-arm64-musl`, a package none of those apps import. The install stage now takes the package name as a build argument and passes it to `--filter`, which drops the telegram image from the full dependency tree to 81 packages and leaves the workspace symlinks intact.

## 1.5.2

### Patch Changes

- 97bc8e0: fix: `/camera_snapshot` without a name, and quieter heartbeat logs
  
  An empty argument reached the lookup and produced "Камера  не найдена" with a blank name; it now asks for a camera and lists the available ones — as does the not-found reply. Heartbeats are no longer logged every 30 seconds per service: only a service appearing or changing version is worth a line.

## 1.5.1

### Patch Changes

- 1d88f83: fix: requesting a clip that is not ready duplicated the message
  
  When the NVR had no clip yet, the empty result took the create/update path, whose `editMessageText` cannot edit a message that already carries a photo. The failure threw, the entry was redelivered, and the user saw a second copy of the event without its snapshot while the button hung on "processing". An empty result now only repaints the button, and says the clip may simply not be written yet — a retry a little later usually works. A media artifact the NVR refuses is logged at warn instead of debug, so the reason is visible.

## 1.5.0

### Minor Changes

- 9569cee: feat: real progress for a requested clip
  
  The "Видео" button now moves through its actual stages (запрошено → скачивается → конвертируется) instead of showing one frozen label until the video lands. A clip that fails or takes too long ends with a retry button and the reason, so a stuck request is something the user can act on rather than a spinner that never stops.

### Patch Changes

- Updated dependencies [9569cee]
  - @spotter/transport@1.5.0

## 1.4.1

### Patch Changes

- b1fff5c: fix: ingest node visible in /status
  
  Heartbeats now cross the forwarder, and the forwarder reports itself, so
  `/status` lists the ingest services instead of the cloud alone. The unknown
  command handler no longer answers commands that exist.

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
