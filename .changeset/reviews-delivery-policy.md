---
'@spotter/transport': minor
'@spotter/frigate': minor
'@spotter/server': minor
---

feat: filter delivery by the NVR's own verdict. The adapter reads `frigate/reviews` and stamps `severity` on the event, and `DELIVERY_POLICY=alerts` keeps pushes for alerts only
