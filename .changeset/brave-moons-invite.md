---
"@spotter/frigate": patch
---

fix: MQTT broker is configurable, not hard-wired

The broker address moved from compose into `.env`, so an existing broker can be used instead of ours. Our own mosquitto now lives behind the `mqtt` profile and joins the external `spotter-mqtt` network, which a Frigate container can join to reach it without opening a host port. The installer asks which of the two applies, and `doctor` checks that the broker is reachable and that events actually arrive.
