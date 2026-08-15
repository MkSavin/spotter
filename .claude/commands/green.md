---
description: Green check — typecheck + tests + biome across the repo
allowed-tools: Bash(bun run green:*), Bash(bun run test:*), Bash(bunx tsc:*), Bash(bunx biome:*)
---

Run the verification suite and report **concisely**. The whole repo takes ~3 seconds, so there is
no scoping to reason about — just run it and surface failures.

## Steps

```bash
bun run green
```

That is `tsc --noEmit`, then `bun test apps packages` (which builds the pwa web bundle first via
`pretest`), then `biome check`. `$ARGUMENTS`, if given, narrows the run — e.g. a single test path.

## Reporting

- If everything passes: one line — `✅ green (typecheck + tests + biome)`.
- If something fails: show **only** the failing file(s) and the relevant error lines, not the full
  output. Then state the smallest fix and (unless told otherwise) apply it and re-run.
