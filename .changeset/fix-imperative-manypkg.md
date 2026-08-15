---
'@spotter/server': patch
---

Fix the image build step crashing with `undefined is not an object (evaluating
'root.dir')` after changesets published a release.

`.integration/imperative.ts` imports `@manypkg/get-packages` but never declared
it — the import resolved through changesets' own dependency tree, so the runner
was free to hoist a different major than the one installed locally. In v2 the
`root: { dir }` object was renamed to a plain `rootDir` string, so `root` came
back undefined and the matrix step died before building anything.

The package is now a direct devDependency pinned in the lockfile, and the script
accepts either shape, so it keeps working whichever major gets resolved.
