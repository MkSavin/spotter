---
"@spotter/server": patch
---

fix: stop losing snapshots on events Frigate has not flagged yet

The eager snapshot request was gated on `hasSnapshot`, and events whose `end` message carried `has_snapshot: false` never got a photo at all — the notification stayed text-only with no way to recover.

Frigate writes the snapshot to disk only once tracking ends, so the flag on the very message that reports the end is routinely still false; it is not a reliable statement about whether a snapshot will exist. The request now goes out on every `end`. Asking when there is genuinely nothing to fetch is safe and already handled: the adapter answers `Nothing staged` and publishes an empty `mediaProcessed`, which is the same outcome as never asking — minus the lost snapshots.
