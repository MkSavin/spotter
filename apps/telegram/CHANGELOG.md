# @spotter/telegram

## 1.7.1

### Patch Changes

- ce37f5e: fix: make the `sent_at` migration work on a populated table — SQLite rejects a non-constant DEFAULT in `ALTER TABLE ADD COLUMN` once the table has rows

## 1.7.0

### Minor Changes

- 3563382: feat: rate-limit commands that reach the NVR. A repeat in the same chat is dropped (3 s by default, 60 s for `/timelapse`); commands that only read local state stay unthrottled
- 2b590c2: feat: add silence controls. `/mute` and `/unmute` silence a single chat, and `/nvr_suspend` (ADMIN) suspends the NVR's own notifications through the new `NotificationSuspender` port
- 0ecd990: feat: report queue depth in the heartbeat and show it in `/status`: how many entries are waiting, how many are in flight, and the age of the oldest unacked one
- 3ed7822: feat: bound table growth. Events, dedup ledgers and message links are trimmed by age, and access codes now expire (`ACCESS_CODE_TTL_HOURS`, a day by default)
- 049f333: feat: let `/user_sign` pick a role (VIEWER by default), and have the PWA say why a code was refused instead of the blanket "invalid or already used"
- 152ccba: feat: stop failing long timelapses on the clock. A 12 h deadline (`TIMELAPSE_DEADLINE_HOURS`) and a check against the NVR before giving up, plus live status and a `/timelapse_status` command

### Patch Changes

- 211f3c3: chore: drop the `PRAGMA foreign_keys` that enforced nothing — no schema declares a foreign key, and SQLite cannot check relations that span services
- 8d537a3: fix: correct the duration of events longer than a day — a copy of `renderEventTiming` took hours modulo 60 and rendered "1 дней 25 ч"
- b389438: refactor: reduce the role vocabulary and username normalisation to a single definition in `@spotter/transport`, so access checks in server and telegram no longer rely on local copies of `ROLE_RANK`
- Updated dependencies [2b590c2]
- Updated dependencies [0ecd990]
- Updated dependencies [3ed7822]
- Updated dependencies [93d636e]
- Updated dependencies [b389438]
- Updated dependencies [152ccba]
  - @spotter/transport@1.8.0

## 1.6.1

### Patch Changes

- 32d9796: chore: upgrade the runtime to Bun 1.4
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
