---
'@spotter/transport': minor
'@spotter/sink': minor
'@spotter/telegram': minor
'@spotter/frigate': minor
---

feat: report the NVR's own camera health

Silence from a source cannot tell a quiet driveway from a camera whose stream dropped — but the NVR knows within seconds. The Frigate adapter now polls `/api/stats` in the background and reports, per camera, whether video is arriving and whether the detector sees it. Both appear in `/status`: a dead camera leads the message, and every adapter shows when it last saw an event.

Two distinct faults are separated, because they need different fixes: a camera with no frames at all (the stream is gone) and a camera with frames the detector never sees (video is fine, no event can be produced). A camera with detection deliberately switched off is neither, and is never reported.

State transitions are logged rather than the state itself, so a stream that drops at 02:00 leaves a line saying so instead of one repeated line a minute. A failed probe keeps the last good reading — not being able to ask is not evidence of health.

fix: stop asking Frigate to end a manual event that has a duration

`/event_test real` created the event with a duration, so Frigate closes it itself and refuses the manual end, leaving `has a set duration and can not be ended manually` in the NVR's log on every test run.
