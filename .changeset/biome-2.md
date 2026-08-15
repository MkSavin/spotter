---
'@spotter/server': patch
---

Upgrade Biome 1.9.4 → 2.5.8.

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
