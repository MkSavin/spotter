---
'@spotter/frigate': patch
'@spotter/server': patch
'@spotter/sink': patch
'@spotter/transport': patch
---

Motionless events no longer reach the chat. Frigate writes neither a snapshot nor a clip when `position_changes` is 0 — `should_save_snapshot` and `should_retain_recording` both reject on that field — so such an event could only ever arrive empty. The filter is back on every lifecycle stage instead of `update` alone; set `SKIP_MOTIONLESS_EVENTS=false` to keep them.

Snapshots are now fetched according to the event's own flag rather than blindly. Frigate writes the file to disk before it announces the end, so `hasSnapshot` on an `end` is final: when it is false the adapter cuts a frame from the continuous recording straight away instead of spending a request on a certain 404. The frame is located by the event's own timestamps rather than by querying the NVR, which does not yet know the event that soon and used to refuse silently.
