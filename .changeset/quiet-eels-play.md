---
"@spotter/transport": patch
---

test: end-to-end suite over a real bus and both deployment shapes

Unit tests kept passing while the product broke, because what breaks is the wiring between services — a stream nobody mirrors, a consumer group that never comes back — and none of that exists inside a single service.

The suite runs the services' real controllers against a real Redis in Docker, in both shapes Spotter is deployed in: one node, and ingest+cloud bridged by the forwarder. The split shape matters most — it uses the forwarder's own stream map, so a stream left out of it fails here exactly as in production, by silently never arriving. Only what we do not own is faked: the NVR, S3, Telegram and web-push. Without Docker the suite skips rather than fails, so `bun test` stays green anywhere.

Writing it immediately turned up a defect that the earlier reliability work missed. Losing Redis entirely — `docker rm -f` on the container, which is what an image update does — leaves consumers stuck for good: the producer keeps publishing, events pile up, nothing reads them. A `FLUSHALL` recovers, because the connection survives and the NOGROUP branch recreates the groups; destroying the container does not. The reproduction is committed as a `test.failing` rather than deleted to keep the suite green, and the measurements are in `.e2e/README.md`.

What this level cannot see: every service's `index.ts` ends in `process.exit`, so the process shell itself is not exercised, and errors in Dockerfiles, env or compose stay invisible to it.
