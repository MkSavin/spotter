# @spotter/transport

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
