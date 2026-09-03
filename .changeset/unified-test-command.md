---
'@spotter/telegram': minor
'@spotter/frigate': minor
'@spotter/transport': minor
'@spotter/forwarder': patch
---

feat: replace `/test_delivery` and `/test_media` with a single `/test`

`/test [камера] [объект]` publishes to `spotter.probe.request.<source>`; the adapter arms the probe, and the NVR does the rest — it sees the object, tracks it, records the clip and publishes the event itself. What arrives in Telegram came the whole way round.

The two old commands seeded `spotter.event.test_seed`, which skipped MQTT entirely: they proved our idea of an event, never the NVR's. The stretch they skipped is the one that went silent for two days in production while both commands kept passing. `test_seed`, `eventTestController` and `eventTestAction` are gone, and the forwarder now carries the probe request in their place — without that, `/test` on a cloud node could never reach an adapter on ingest.

`PROBE_ENDPOINT` is empty by default and stays empty in production: the probe replaces the NVR's detector, so a request with no probe configured is refused with a reason rather than silently doing nothing.
