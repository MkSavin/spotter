---
"@spotter/depot": patch
"@spotter/transport": patch
---

fix: retry transient media failures instead of acking them away

A failed transcode was indistinguishable from a broken clip: `mediaStagedAction` caught every error, returned empty, and the controller published `media_processed` — so the regulator acked. An S3 blip or a not-yet-visible staged object therefore lost the media for good, bypassing the PEL/reaper/DLQ machinery entirely. S3 reads/writes and ffmpeg timeouts now raise `TransientError` and propagate, leaving the entry pending for the reaper; only genuinely broken media (bad codec, unreadable input) still reports a final miss. Clip and snapshot are judged independently, so a permanent failure of one does not hold back the other.

The dead-letter boundary was also off by one: `deliveries > maxDeliveries` granted a sixth attempt against a documented budget of five, which for a transcode is a wasted full run.
