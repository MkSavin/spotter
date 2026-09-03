---
'@spotter/transport': patch
---

test: close the NVR rig's chain through the adapter into Redis

The rig now runs our own adapter image beside Frigate, so a `/detect` call is followed all the way: probe → Frigate's detector → its tracker → MQTT → the adapter → `spotter.event`. The score handed to the probe comes back out of Redis unchanged, which is the one thing seeding `spotter.event.test_seed` can never show.

Adds minio (the adapter refuses to start without S3) and `bun run nvr:build` for the adapter image. Five tests, ~107s from a cold start.
