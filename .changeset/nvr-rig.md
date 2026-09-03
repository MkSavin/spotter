---
'@spotter/transport': patch
---

test: drive a real Frigate from the probe in its own rig

Adds `.e2e/nvr/`: a pinned Frigate `0.17.2`, a real broker, and the probe as its detector, with `bun run test:nvr` asserting the NVR connects to MQTT, polls the detector, and publishes an event of its own making. That hop — NVR to broker to adapter — was covered by nothing, and it is the one that went silent in production for two days while every seeded test stayed green.

Separate from smoke on purpose: smoke stays light against a fake NVR, this pays a ~500MB image for an answer smoke cannot give. It skips itself when docker or the image is absent.

The probe's healthcheck moves into its image, and it now asks `127.0.0.1` rather than `localhost` — alpine resolves the name to `::1` first, where nothing listens, so the check could never pass and would have held Frigate at the starting line with no hint why. The image also builds from the committed `Cargo.lock` instead of resolving fresh versions.
