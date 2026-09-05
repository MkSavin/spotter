---
'@spotter/transport': minor
'@spotter/server': patch
'@spotter/telegram': patch
'@spotter/pwa': patch
'@spotter/email': patch
'@spotter/depot': patch
'@spotter/frigate': patch
'@spotter/sink': patch
---

refactor: read the S3 block in one place

Six services declared the same `S3Config` type and read the same four `S3_*` variables, each with its own copy of the defaults. Adding a variable meant editing six files and hoping none was missed. `resolveS3Config` in transport now owns the block, the way `resolveRedisConfig` already owned the Redis one; `SinkS3Config` extends it with the staging prefix only adapters need.

Also removed: a dead `innoxiousHelpers` export nothing imported, three redundant named JWT exports beside the default object every caller actually uses, and the `typecheck:full` script, which had become a second name for `tsc --noEmit` — the docs pointing at it as a wider check were saying something untrue.

`zod` in pwa, `abort-controller` in telegram and the changesets read/write packages at the root were imported but only resolved transitively; they are declared now.
