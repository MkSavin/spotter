---
'@spotter/server': patch
---

Upgrade to TypeScript 7, drop Turborepo, and remove dead configuration.

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
