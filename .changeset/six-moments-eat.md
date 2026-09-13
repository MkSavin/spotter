---
'@spotter/depot': patch
'@spotter/sink': patch
---

Transcoding no longer runs inside the Redis entry that asked for it. The entry is acked as soon as the job is recorded, so a clip may encode for hours while the reclaim window keeps meaning what it should: the replica died. `VIDEO_TIMEOUT_MS` rises to four hours and now only kills a stuck ffmpeg.

Accepted jobs are kept on disk and resumed at startup, because nothing redelivers an acked entry. Each depot replica therefore needs its own `/data` volume, already added to the compose profiles.

The timelapse store is now the shared `FileJobStore`, which both trackers use.
