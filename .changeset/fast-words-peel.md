---
'@spotter/transport': minor
'@spotter/server': patch
'@spotter/depot': minor
'@spotter/telegram': minor
---

Deliver clips larger than Telegram accepts. Telegram fetches at most 20 MB by URL and takes 50 MB as an upload, so a 60 MB clip hung on the last progress step: every delivery failed with `failed to get HTTP URL content` until the entry went to the dead-letter stream.

Depot now also cuts a clip above `VIDEO_PART_LIMIT_MB` (default 20, `0` disables) into parts no larger, by stream copy on keyframes. The whole clip stays in `clipKey` for consumers without a limit; the parts travel in the new optional `clipParts` field of `mediaProcessed` and `deliveryEvent`. A failed cut still delivers the whole clip.

Telegram puts part 1 in the event message and sends the rest as replies, in order. Each sent part is recorded in the new `event_clip_parts` table, so a retry resumes at the first missing part instead of sending any twice.

`editMessageMedia` now goes through `InnoxiousExecutor` like every send, instead of a single hand-rolled fallback. Media over Telegram's URL limit is uploaded as bytes without first wasting an attempt on the URL, sized with a one-byte ranged GET because a presigned URL may refuse HEAD. A failed download is no longer cached, so a later attempt can succeed.
