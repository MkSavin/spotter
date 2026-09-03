---
'@spotter/frigate': patch
---

feat: say at startup when the NVR has MQTT switched off

Frigate publishes events over MQTT only when its own config enables it, and its minimal config ships with `enabled: false`. With MQTT off the NVR looks completely healthy — the UI works, the API answers, snapshots and `frigate/available` stay retained on the broker — while no event is ever published, and the adapter sits connected to a broker that will never send it anything.

The adapter now reads `mqtt` from the NVR's `/api/config` on start and logs an error naming the cause, instead of leaving a silent pipeline that looks fine from every angle. It is logged rather than fatal: media requests and timelapse exports still work on such a node, so refusing to start would take working features down over a setting only the operator can change.
