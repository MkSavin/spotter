---
'@spotter/depot': patch
'@spotter/frigate': patch
---

Depot and the frigate adapter can write their job stores again. Both images run as `bun`, but `/data` did not exist in them, so Docker created the volume's mount point as root and every write failed with `EACCES`. The store only warned, so transcodes and timelapse exports ran on, yet nothing was remembered, and every restart — watchtower restarts daily — silently dropped the jobs in flight. The images now create `/data` owned by `bun`; Docker fills an empty named volume from the image together with its owner, so volumes already created on a node fix themselves on the next start.

The CPU preset for `VIDEO_QUALITY=best`, the default, was `normal`, which neither x264 nor x265 has: every CPU encode at that quality failed on frame 0, including the fallback after a failed NVENC run. It is now `medium`, their own default, and every quality is encoded by a test on real ffmpeg.

Depot S3 transfers now fail on silence instead of hanging forever. `Bun.S3Client` has no timeout of its own, so a stalled connection never settled: the job waiting on it held its slot forever, and since a replica reads only for a free slot, it silently stopped taking clips, with nothing in the log. A fixed timeout would cut exactly the long clips the transcode queue exists for, so what is bounded is silence, `S3_STALL_MS` (default 2 minutes): the raw clip streams to disk with each chunk awaited, and the result uploads in 5 MiB parts with each `flush()` awaited — `write()` alone buffers everything and reports nothing. A slow transfer that keeps moving is never cut, however long it takes. Streaming also stops depot from holding a whole clip in memory.
