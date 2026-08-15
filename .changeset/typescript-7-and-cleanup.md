---
'@spotter/server': patch
---

Upgrade to TypeScript 7 and drop dead configuration.

TypeScript 7.0.2 is the native compiler, and it typechecks the whole repo in
0.54s instead of 2.35s. Per-package `turbo run typecheck` drops from 6.4s to
1.4s. No source changes were needed — the existing `tsconfig.json` and all 11
packages typecheck clean on the first run.

Removed: `lodash` (never imported), `bot.config.ts` and its ignore entries
(left over from the bot split), the `apps/bot/*`, `config.ts` and
`.releaserc.json` entries in `.dockerignore` pointing at paths that no longer
exist, and the `docker:single` / `docker:ingest` / `docker:cloud` scripts, which
duplicated the Makefile targets while skipping the data-directory setup those
targets do. `docker:dev` stays — it is the documented way to start the dev infra
and has no Makefile equivalent.
