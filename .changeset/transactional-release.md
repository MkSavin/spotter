---
'@spotter/server': patch
---

Make releases transactional and migrate to Changesets v3.

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
