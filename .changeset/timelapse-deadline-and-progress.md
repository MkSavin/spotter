---
'@spotter/transport': minor
'@spotter/sink': minor
'@spotter/frigate': minor
'@spotter/telegram': minor
'@spotter/forwarder': patch
---

feat: stop failing long timelapses on the clock. A 12 h deadline (`TIMELAPSE_DEADLINE_HOURS`) and a check against the NVR before giving up, plus live status and a `/timelapse_status` command
