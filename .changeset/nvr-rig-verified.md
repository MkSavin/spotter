---
'@spotter/transport': patch
---

test: make the NVR rig actually produce events, verified against Frigate 0.17.2

The rig now runs end to end: Frigate connects to the broker, polls the probe for every analysed frame, and on `/detect` opens, tracks and closes events of its own — `frigate/events` carries the real `before`/`after` payload with the score we asked for, and the NVR's own database records them.

Four fixes, each found by running it and each invisible without a real NVR:

- `detect.enabled` is explicit. It defaults to `false` in 0.17, so the camera captured fine while never calling the detector.
- `record.retain` becomes `record.continuous.days`. The old key is rejected outright in 0.17, and Frigate answers an invalid config by starting in safe mode with a CPU detector — a healthy-looking NVR that simply never calls the probe.
- No comments inside `go2rtc.streams`. Frigate copies that block into go2rtc's config verbatim, and a comment between the key and its list leaves the stream registered with no producer running, so Frigate 404s against its own restream.
- The source clip is 20 minutes rather than 30 seconds. go2rtc's `#loop` ends at EOF and `#input=` flags land after the output URL where ffmpeg rejects them, so a file longer than any run is the honest fix.

The config mount is writable (Frigate migrates its own config across versions) and the rig's ports move off 5000/8554, which collide with AirPlay and with a developer's own Frigate.
