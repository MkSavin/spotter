---
description: Scoped green check — typecheck + tests on affected packages, then biome
allowed-tools: Bash(turbo run typecheck:*), Bash(turbo run test:*), Bash(biome check:*), Bash(bunx biome:*), Bash(bun run green:*)
---

Run the scoped verification suite and report **concisely**. Goal: keep the repo green with
minimal context — scope to affected packages, only surface failures.

## Steps

1. Run the affected typecheck + tests (turbo scopes to changed packages and replays cache for
   unchanged ones):

   ```bash
   TURBO_SCM_BASE=master turbo run typecheck test --affected
   ```

   `$ARGUMENTS` may narrow further (e.g. `--filter=@spotter/bot` to force a single package, or
   `--force` to bypass cache). Append them if provided.

2. Run biome over the repo (single shared config, fast — no per-package scoping needed):

   ```bash
   biome check
   ```

## Reporting

- If everything passes: one line — `✅ green (typecheck + tests + biome)`, plus which packages
  turbo actually ran vs. replayed from cache.
- If something fails: show **only** the failing package(s) and the relevant error lines, not the
  full output. Then state the smallest fix and (unless told otherwise) apply it and re-run.
- Never run the full-repo `tsc --noEmit` (`bun run typecheck:full`) unless `--affected` misses
  something (e.g. a root-level `*.config.ts`); note if you fall back to it and why.
