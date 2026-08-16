# @spotter/transport

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
