# @spotter/pwa

## 0.2.0

### Minor Changes

- d5ad59b: feat: timelapses and user management in the PWA
  
  Both of the remaining gaps between the PWA and the bot, now that a command channel exists.
  
  **Timelapses** get their own screen: camera and speed as buttons, a period as ready-made choices or a custom range. Started exports are recorded in SQLite rather than held in memory, because an export runs for minutes and a restart in between would otherwise lose it — the video would be staged and nobody would be waiting for it. The adapter's `ready` message carries no request id, so correlation is by `camera:start:end`, and making that the row id means a redelivery updates the row instead of adding a duplicate. An export that finishes after the request was lost is recorded anyway. A failure notice carries only the camera, so it settles whatever that camera still has running — never an export already delivered.
  
  **User management** forwards to the domain: list, change role, revoke, mint a code. Nothing is written to domain tables from here, and the admin check in the PWA is a convenience the server re-does against the real recipient. Revoking yourself is refused, since the last admin would lock themselves out.
  
  Two things the domain was missing for this. There was no way to *read* the list of recipients over the bus at all — `user.list` adds it. And `findByRef` resolved a recipient only by Telegram id or username, which a PWA-created recipient has neither of: it could be created and then never managed or revoked. It now also resolves by uuid.
- 6fb558c: feat: make the PWA a real client, not a read-only feed
  
  The PWA could show events and nothing else. It published nothing to the bus, so every action the bot offers — a camera snapshot, a clip, the camera list, service status — simply did not exist there. What blocked all of them was the same missing piece: a way to send a command and hear back.
  
  `CommandBus` was telegram-local despite depending on nothing telegram-specific, so it moves to `@spotter/transport` alongside `HeartbeatRegistry` and a role vocabulary that was already copied into two services and about to be copied into a third.
  
  **Access is granted once, not once per frontend.** A device now redeems a code through the domain (`device.redeem`) from the same pool `/user_sign` mints for the bot, and gets back the real role the server enforces on every later command. Previously the PWA checked codes against a local `PWA_ACCESS_CODES` list that carried no role at all — which is why nothing beyond reading could have worked even with a channel. A code minted for a named Telegram user is refused: there is no username on a device to match it against, and honouring it would hand a personal code to whoever typed it first.
  
  An authorized install lives in its own `devices` table rather than hanging off a push subscription: being authorized is a redeemed code, not permission to send notifications, and browsers rotate a push endpoint without the user doing anything. A role change or revocation reaches the device over `spotter.delivery.recipient`, so a demoted user stops being offered buttons that would only fail.
  
  The feed is now behind the same token. It carries snapshots of the house, and serving it to anyone who knows the URL was never intended.

### Patch Changes

- 32d9796: Обновление рантайма до Bun 1.4
- df906a6: fix: keep the snapshot on a card whose event also has a clip
  
  Every event with a video showed a placeholder instead of its image. The snapshot and the clip arrive as separate `media` deliveries — the clip last, since transcoding a video takes longer — and each carries only its own key. The feed cache replaced the stored row wholesale, so the clip's delivery wrote `snapshotKey: undefined` over the image that had already arrived. Keys are now merged into what is already cached.
- eb53cee: feat: notify when a timelapse is ready
  
  An export takes minutes, and until now the only way to learn it had finished was to keep the timelapse screen open — closing the app meant coming back to check by hand.
  
  The notification bypasses the coalescer deliberately. That exists to collapse a storm of events on one camera into a single "N событий", which is right for detections and wrong here: an export is one deliberate request, and folding its result away would lose the only signal the user asked for. It is tagged per camera instead, so a later result replaces an earlier one rather than stacking.
  
  A failure for an export this instance was not tracking pushes nothing — there is nobody to tell, and waking a device over someone else's export is noise.
- Updated dependencies [6fb558c]
- Updated dependencies [714cf4e]
- Updated dependencies [044e6ae]
- Updated dependencies [fdd83e2]
- Updated dependencies [18a45ec]
  - @spotter/transport@1.7.0

## 0.1.5

### Patch Changes

- a53eb49: fix: survive a restart of any other service at any time
  
  Watchtower can restart anything at any moment, so every service has to tolerate every other one disappearing under it. Several could not, and the failures shared one shape: the process stayed alive and the container stayed "running" while the service did nothing at all — so the restart policy never fired and the problem was only visible to users.
  
  **A Redis client that outlives its connection timeout is finished.** Measured against a real server: an outage under ~10s is absorbed by the offline queue and never surfaces, but a longer one puts the client in a state it never leaves — Redis came back and every command still failed, indefinitely. `maxRetries` does not change this; the two configurations were compared directly and neither recovers. Only a new client does, which is why recreating the container was the one thing that ever worked. `RedisConnection` now owns the client and rebuilds it on a dead connection, recovering in about a second, and all sixteen call sites use it.
  
  **A consumer group that disappears never comes back.** A Redis restored without its data answers every `XREADGROUP` with `NOGROUP`, and the read loop retried that forever, once a second, with no possible outcome. The loop now recognises it and recreates the groups.
  
  **A wedged service was indistinguishable from a working one.** No `spotter-*` container had a healthcheck. Each now refreshes a marker file only while Redis actually answers it, so a service that stops working goes stale and gets restarted; a brief blip stays well inside the threshold.
  
  **A clip request did not survive the bot.** The wait lived in memory, so a restart left the "⏳" button frozen with no way to retry even after the video arrived. Waits are persisted and released on startup as a retry.
  
  Depot also sweeps temp directories left by a killed predecessor — each run creates a fresh one, so the orphans accumulated — and gets a 45s stop grace period, since ffmpeg cannot finish inside Docker's default 10s.
- Updated dependencies [a53eb49]
- Updated dependencies [a53eb49]
- Updated dependencies [a53eb49]
  - @spotter/transport@1.6.0

## 0.1.4

### Patch Changes

- f6ff724: refactor: share CatalogCache and catalogController from transport
  
  The catalog controller was byte-identical in telegram, pwa and email, and four near-identical `CatalogCache` copies had already started drifting apart in comments and helpers. Both now live in `@spotter/transport`, where the rest of the catalog contract already sits, so a change to label resolution is one edit instead of four.
- Updated dependencies [f6ff724]
- Updated dependencies [f6ff724]
  - @spotter/transport@1.5.2

## 0.1.3

### Patch Changes

- dbb2afa: fix: install only the dependencies each image actually uses
  
  Every Dockerfile ran an unfiltered `bun install`, so each backend image downloaded the PWA's frontend toolchain — vite, tailwind and lightningcss's native prebuilds. The arm64 leg then failed extracting `lightningcss-linux-arm64-musl`, a package none of those apps import. The install stage now takes the package name as a build argument and passes it to `--filter`, which drops the telegram image from the full dependency tree to 81 packages and leaves the workspace symlinks intact.

## 0.1.2

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

## 0.1.1

### Patch Changes

- 0a9746f: Build the web bundle before running the tests, and only when it is stale.
  
  `static.test.ts` fetches the SPA shell and the manifest from a real server, so it
  needs `web/dist` — which is gitignored and never built in CI, leaving the two
  assertions to fail on `text/plain` and 503. A root `pretest` script now builds it
  before `bun test` runs.
  
  Building it unconditionally cost ~1s on every run, almost all of it vite's
  startup: the build itself takes 14ms. `.integration/rerun.ts` skips a command
  when its output is newer than its sources, which drops that to 0.04s when the
  bundle is current.

## 0.1.0

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

### Patch Changes

- Updated dependencies [52344b5]
  - @spotter/transport@1.3.0
