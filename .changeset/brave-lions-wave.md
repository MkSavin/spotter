---
"@spotter/sink": patch
"@spotter/depot": patch
---

fix: keep retrying media the NVR has not written yet, stop retrying timeouts

Two opposite mistakes in how the pipeline judged failure, both visible after the forwarder came back and flushed a backlog.

A staging miss was acked as final. Frigate writes media seconds after an event ends and rate-limits under a burst, so most of those misses were temporary — but the entry was gone, and roughly two thirds of the flushed events never got their snapshot. The adapter now rethrows, leaving the entry pending for the reaper; the `failed` progress report still goes out immediately, so the clip button says why instead of spinning.

An ffmpeg timeout, meanwhile, was marked transient and retried. A timeout means the clip is too long or the machine too slow, so every attempt hits the same wall — five deliveries of the same doomed transcode, each occupying a worker. It is final again, which is what `shouldRetryOnCpu` already assumed. A clip that legitimately needs longer wants a higher `VIDEO_TIMEOUT_MS`, kept below `REDIS_RECLAIM_MIN_IDLE_MS`.
