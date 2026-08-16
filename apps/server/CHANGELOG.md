# @spotter/server

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
