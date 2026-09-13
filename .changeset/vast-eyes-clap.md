---
'@spotter/depot': patch
---

Temp files are now removed when a transcode fails, not only when it succeeds. A timed-out clip is retried, so each attempt used to leave a raw copy and a half-written mp4 on the same disk the NVR records onto.

The transcode cap rises to 10 minutes, with the reclaim window to 20 for depot alone: at two minutes a clip was cut off three quarters of the way through. The service now refuses to start when the cap is not below the reclaim window, which would let a second replica pick up a clip still being encoded.
