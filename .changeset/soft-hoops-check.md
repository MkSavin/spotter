---
"@spotter/forwarder": patch
---

fix: doctor reported a healthy Frigate as broken

The check truncated `/api/config` at 400 bytes and then looked for `cameras` in what was left — on Frigate 0.17 that key sits further in, so a perfectly good NVR came back as a failure. The response is now parsed inside the container, and the check reports the actual camera count and Frigate version. A 401 gets its own hint, and a config with no cameras is a warning rather than a pass.
