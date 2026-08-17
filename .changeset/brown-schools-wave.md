---
"@spotter/depot": patch
---

fix: decide the CPU fallback by how far ffmpeg got, not by its wording

The fallback matched on error phrasing, so a hardware failure it had not seen before ("Conversion failed!") slipped through and the clip was lost instead of transcoding slower. The decision now uses facts the runtime already has: zero frames means ffmpeg died on the device and the CPU is worth a try, while a timeout or a mid-stream failure points at the input and would fail again. The GPU overlay is back to the device list Frigate documents, which is known to work on this hardware.
