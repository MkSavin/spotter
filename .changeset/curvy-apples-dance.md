---
'@spotter/transport': patch
'@spotter/depot': patch
'@spotter/sink': patch
---

Close four race conditions found by auditing state that changes across an `await`.

`TranscodeQueue` claimed a job id only after persisting it, so a redelivery arriving mid-write queued the same clip twice and two ffmpeg processes encoded one file. The id is now claimed synchronously, before the first `await`, and `recover` honours the same claim.

`FileJobStore` set its loaded flag before reading the file, so a concurrent caller skipped the read and saw an empty store. The read is cached as a promise instead, which every caller awaits. At startup this was the difference between recovering unfinished jobs and silently dropping them.

Depot recovers stored jobs before the regulator starts consuming; the other order let a message arriving in between be queued twice. Its shutdown is re-entrant, so a second signal waits for the first pass rather than closing connections an in-flight encode still uses.

`TimelapseTracker` ran its deadline branch with no `.catch()`, and an unhandled rejection terminates a Bun process outright. Every entry point now also logs unhandled rejections through the new `guardRejections` helper, turning a silent container restart into something diagnosable.
