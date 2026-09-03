---
'@spotter/transport': minor
'@spotter/telegram': minor
'@spotter/frigate': minor
'@spotter/sink': minor
---

feat: alert when the NVR stops talking, instead of waiting to be told

The adapter now tracks when its NVR last said *anything* on the transport, not only when it last produced an event, and the bot checks that on a timer and messages admins the moment it goes stale.

This is the signal that was missing in September 2026. Frigate lost its route to the broker and published nothing for 60 hours while every other indicator stayed green: the adapter was connected, subscribed and beating, the NVR answered HTTP and served video. Nothing was watching the one thing that had actually stopped, and a break went unnoticed.

Two thresholds, deliberately far apart, because they answer different questions. Event silence (6 hours) can be a quiet night and cannot be shortened without crying wolf every winter morning. No housekeeping traffic at all (15 minutes) is never normal — Frigate publishes `frigate/stats` once a minute regardless of what happens in front of the cameras, which is measured on the rig rather than taken from the docs. Where a source reports contact, event silence stops raising anything on its own: an NVR that is demonstrably alive and simply has nothing to report is not a fault.

The check runs on a timer rather than on heartbeat arrival, which is the whole point: a broken NVR does not send a message saying it is broken. Alerts fire on transitions only — one at the outage, one at recovery with how long it lasted — because a warning that repeats every minute gets muted, and then the next outage goes unseen too. The outage alert makes a sound; the recovery does not.

`/status` shows the same state as its own line, above the source figures — otherwise "last event an hour ago" reads as good news.
