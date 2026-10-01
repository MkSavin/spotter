---
'@spotter/transport': minor
'@spotter/depot': patch
'@spotter/telegram': patch
---

A depot replica no longer takes clips it cannot start. Acking a clip the moment it was queued removed the backpressure the blocked read loop used to give: a replica busy with an hour-long encode kept reading, up to `REDIS_COUNT` entries at once, and queued them behind itself while the other replica sat idle. The clip waited silently, with nothing logged above `verbose`.

`RedisRegulator` takes an optional `admit` that resolves with how many entries the consumer can start now; the next read takes no more, floored at one because Redis reads `COUNT 0` as no limit. The wait is raced with `stop()`, so shutdown does not hang on a full consumer. Depot passes `queue.vacancy()`, so a busy replica leaves the clip in the stream for any free one, and recovered jobs fill its slots before it reads anything new. Accepting a transcode is now logged at `info`.

Tapping the "⏳" clip button re-checks the wait instead of only acknowledging the tap. The button carries no event id, so the event is found from the message it sits on, which also revives buttons already stuck. While the wait lives the user sees its stage and when a restart opens up; once nothing awaits the clip — timed out, or lost to a failed repaint or a restart — the tap requests it again.
