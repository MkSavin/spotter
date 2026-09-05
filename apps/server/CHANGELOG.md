# @spotter/server

## 1.4.1

### Patch Changes

- 9108030: refactor: read the S3 block in one place
  
  Six services declared the same `S3Config` type and read the same four `S3_*` variables, each with its own copy of the defaults. Adding a variable meant editing six files and hoping none was missed. `resolveS3Config` in transport now owns the block, the way `resolveRedisConfig` already owned the Redis one; `SinkS3Config` extends it with the staging prefix only adapters need.
  
  Also removed: a dead `innoxiousHelpers` export nothing imported, three redundant named JWT exports beside the default object every caller actually uses, and the `typecheck:full` script, which had become a second name for `tsc --noEmit` — the docs pointing at it as a wider check were saying something untrue.
  
  `zod` in pwa, `abort-controller` in telegram and the changesets read/write packages at the root were imported but only resolved transitively; they are declared now.
- Updated dependencies [9108030]
- Updated dependencies [d0e5fd5]
  - @spotter/transport@1.10.0

## 1.4.0

### Minor Changes

- 98a2893: feat: bound table growth. Events, dedup ledgers and message links are trimmed by age, and access codes now expire (`ACCESS_CODE_TTL_HOURS`, a day by default)
- 86b3270: feat: filter delivery by the NVR's own verdict. The adapter reads `frigate/reviews` and stamps `severity` on the event, and `DELIVERY_POLICY=alerts` keeps pushes for alerts only
- 6a348ed: feat: let `/user_sign` pick a role (VIEWER by default), and have the PWA say why a code was refused instead of the blanket "invalid or already used"

### Patch Changes

- bae64c6: chore: drop the `PRAGMA foreign_keys` that enforced nothing — no schema declares a foreign key, and SQLite cannot check relations that span services
- 152a587: feat: report queue depth in the heartbeat and show it in `/status`: how many entries are waiting, how many are in flight, and the age of the oldest unacked one
- 4f28b4b: refactor: reduce the role vocabulary and username normalisation to a single definition in `@spotter/transport`, so access checks in server and telegram no longer rely on local copies of `ROLE_RANK`
- Updated dependencies [2b590c2]
- Updated dependencies [0ecd990]
- Updated dependencies [3ed7822]
- Updated dependencies [93d636e]
- Updated dependencies [b389438]
- Updated dependencies [152ccba]
  - @spotter/transport@1.8.0

## 1.3.0

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

- 2a4d678: chore: upgrade the runtime to Bun 1.4
- Updated dependencies [6fb558c]
- Updated dependencies [714cf4e]
- Updated dependencies [044e6ae]
- Updated dependencies [fdd83e2]
- Updated dependencies [18a45ec]
  - @spotter/transport@1.7.0

## 1.2.7

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

## 1.2.6

### Patch Changes

- 56c21b1: fix: stop losing snapshots on events Frigate has not flagged yet
  
  The eager snapshot request was gated on `hasSnapshot`, and events whose `end` message carried `has_snapshot: false` never got a photo at all — the notification stayed text-only with no way to recover.
  
  Frigate writes the snapshot to disk only once tracking ends, so the flag on the very message that reports the end is routinely still false; it is not a reliable statement about whether a snapshot will exist. The request now goes out on every `end`. Asking when there is genuinely nothing to fetch is safe and already handled: the adapter answers `Nothing staged` and publishes an empty `mediaProcessed`, which is the same outcome as never asking — minus the lost snapshots.
- Updated dependencies [56c21b1]
  - @spotter/transport@1.5.4

## 1.2.5

### Patch Changes

- f6ff724: refactor: share CatalogCache and catalogController from transport
  
  The catalog controller was byte-identical in telegram, pwa and email, and four near-identical `CatalogCache` copies had already started drifting apart in comments and helpers. Both now live in `@spotter/transport`, where the rest of the catalog contract already sits, so a change to label resolution is one edit instead of four.
- Updated dependencies [f6ff724]
- Updated dependencies [f6ff724]
  - @spotter/transport@1.5.2

## 1.2.4

### Patch Changes

- dbb2afa: fix: install only the dependencies each image actually uses
  
  Every Dockerfile ran an unfiltered `bun install`, so each backend image downloaded the PWA's frontend toolchain — vite, tailwind and lightningcss's native prebuilds. The arm64 leg then failed extracting `lightningcss-linux-arm64-musl`, a package none of those apps import. The install stage now takes the package name as a build argument and passes it to `--filter`, which drops the telegram image from the full dependency tree to 81 packages and leaves the workspace symlinks intact.

## 1.2.3

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

## 1.2.2

### Patch Changes

- 1cb6a5b: Upgrade Biome 1.9.4 → 2.5.8.
  
  The CI step installed Biome with `version: latest`, so it had already moved to
  2.x while the lockfile stayed on 1.9.4 — and 2.x refuses a config written
  against the 1.9.4 schema. CI now runs `bunx biome ci`, taking the version from
  the lockfile, so the two cannot drift apart again.
  
  `biome migrate` rewrote the config: `files.include`/`files.ignore` merged into a
  single `files.includes` list with negated patterns, `organizeImports` moved under
  `assist.actions.source`, and `linter.rules.recommended` became `preset`.
  
  The v2 import sorter reorders type and value imports together, which touched 72
  files. Stricter rules also found genuinely dead code: unused imports and
  variables, and two unused type imports in `Coalescer.ts`. Unused function
  parameters are prefixed with `_` rather than removed, so the signatures still
  match their call sites.
- b1faae0: Align commitlint with the commit style actually used in this repo.
  
  `subject-case` rejected `chore(ci): Update packages versions`, the message the
  changesets bot writes on every release — so the version PR could never pass the
  lint gate. It was not just the bot: 41 of the last 60 commits start the subject
  with a capital letter, so the rule contradicted the convention rather than
  enforcing it. The rule is off; `agents` joins the allowed types, and
  `body-max-line-length` is off because generated changelog bodies paste long
  lines verbatim. Malformed messages are still rejected.
  
  `@commitlint/cli` and `@commitlint/config-conventional` were referenced by the
  config but never installed, so commit messages could not be checked locally at
  all. They are dependencies now, and CI runs `bunx commitlint` from the lockfile
  instead of `wagoid/commitlint-github-action`, which kept its own copy and could
  not resolve `extends` against ours.
- 87d9971: Fix the image build step crashing with `undefined is not an object (evaluating
  'root.dir')` after changesets published a release.
  
  `.integration/imperative.ts` imports `@manypkg/get-packages` but never declared
  it — the import resolved through changesets' own dependency tree, so the runner
  was free to hoist a different major than the one installed locally. In v2 the
  `root: { dir }` object was renamed to a plain `rootDir` string, so `root` came
  back undefined and the matrix step died before building anything.
  
  The package is now a direct devDependency pinned in the lockfile, and the script
  accepts either shape, so it keeps working whichever major gets resolved.
- 87d9971: Make releases transactional and migrate to Changesets v3.
  
  Tags and GitHub Releases used to be created before the images were built, so a
  failed build left a release that looked complete while nothing had reached ghcr —
  and a re-run refused to build, because there were no pending changesets left.
  
  `release.yml` is now four jobs. `select-mode` decides between opening the version
  PR and publishing; images build one per matrix job as before; and the final
  `publish` job only runs when every image succeeded, so nothing is tagged until
  the artifacts exist. A release that bumps only `packages/*` still gets its tags.
  Until the tags land the publish plan stays non-empty, which is what makes a
  re-run finish the release instead of skipping it.
  
  Upgrades `changesets/action` v1 → v2.1.0 and `@changesets/cli` 2.28.1 → 3.0.0
  (renamed action inputs, explicit `github-token`, `changeset tag` → `git-tag`).
  This also pins `@manypkg/get-packages` v3 — the transitive upgrade to that major
  is what broke the previous release, since v2 renamed `root.dir` to `rootDir`.
  
  `imperative.ts` gains `--from-workspace` for reading versions off `package.json`
  at publish time, and now requires a `Dockerfile` to consider a package
  shippable — `apps/test` has none and would otherwise fail the build.
  
  `lint.yml` additionally runs on pull requests, so branch protection has a check
  to require now that pushing straight to `master` is meant to be disallowed.
- 0a9746f: Upgrade to TypeScript 7, drop Turborepo, and remove dead configuration.
  
  TypeScript 7.0.2 is the native compiler and typechecks the whole repo in 0.54s
  instead of 2.35s. No source changes were needed — all 11 packages pass on the
  first run.
  
  That speedup removed the case for Turborepo. Running `tsc` once over the repo now
  beats Turborepo's cold per-package run (1.5s vs 2.6s), because it invoked `tsc`
  eleven times, and the remaining win came from its cache — worth seconds before,
  fractions of a second now. `bun run green` is a plain
  `tsc && bun test && biome check` at roughly 3 seconds, with no cache to reason
  about or invalidate. `bun --filter` covers the parallel `start` and `build`
  scripts; it ignores `!` exclusions, so the services that must not autostart
  (`forwarder`, `test`) are listed explicitly.
  
  Also removed: `lodash` (never imported), `bot.config.ts` with its ignore entries,
  the `.dockerignore` entries pointing at paths deleted with `apps/bot`, and the
  `docker:single` / `docker:ingest` / `docker:cloud` scripts, which duplicated the
  Makefile targets while skipping the data-directory setup those do. `docker:dev`
  stays — it is the documented way to start the dev infra.

## 1.2.1

### Patch Changes

- f90cc0e: Bind the cloud Redis to the tunnel instead of the public internet, and document
  joining an ingest node to an existing AmneziaWG deployment.

  `production.cloud.yml` published Redis on `6379:6379`, i.e. `0.0.0.0` with no
  password — reachable from anywhere the moment the port was open. The published
  address is now `${REDIS_BIND:-127.0.0.1}`, so the default is loopback-only and a
  two-machine setup sets `REDIS_BIND` to the node's VPN address.

  `docs/deployment.md` gains step-by-step instructions for attaching an ingest node
  behind NAT to an AmneziaVPN server raised by the desktop client: issuing the peer
  config, the `/etc/amnezia/amneziawg/` location `awg-quick` requires, narrowing
  `AllowedIPs` from the default `0.0.0.0/0` so camera and S3 traffic stays off the
  tunnel, and why `spotter-forwarder` needs no compose change to reach it.

- f90cc0e: Fix the `spotter` CLI inside the container, so `make token` works again.

  Two separate failures. `bun build --outfile` emits a plain JS file with no
  executable bit and no shebang, so `docker exec spotter-server ./spotter` died
  with `exec format`-style `permission denied` (exit 126) — the CLI is now invoked
  as `bun spotter`.

  Then the database path: the CLI resolved it from `import.meta.dir/../data`,
  which is correct in development (`apps/server/src` → `apps/server/data`) but
  resolves to `/data` in the image, where the bundle sits at `/app`. That is
  outside the mounted volume and unwritable for uid 1000, so every invocation
  failed with `EACCES: mkdir '/data'`. The path now probes candidates the same way
  `db/client.ts` already resolves migrations, keeping the development layout and
  landing on `/app/data` in the container.

  `Makefile`, the installer and `docs/deployment.md` were updated to the working
  invocation.

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
