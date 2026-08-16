---
'@spotter/frigate': minor
'@spotter/telegram': minor
---

Add `/test_media` — an end-to-end test that exercises the real media pipeline.

`/test_delivery` seeds a synthetic event, so the NVR 404s every media request for
it: useful for checking delivery, useless for checking media. `/test_media` asks
Frigate to create an actual event via `POST /api/events/{camera}/{label}/create`,
waits for the footage, ends it, and publishes the canonical event with the id
Frigate assigned. The clip genuinely exists, so staging, transcoding, presigning
and delivery all run for real.

Frigate does not announce manual events on `frigate/events`, which is why the
adapter publishes the canonical event itself rather than waiting to observe one.
The Frigate calls happen on the ingest node, next to the NVR — the cloud never
needs access to it.
