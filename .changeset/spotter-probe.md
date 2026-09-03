---
'@spotter/transport': patch
---

feat: add `spotter-probe`, a stub detector that drives a real Frigate

Frigate has no hook for creating an event, but its supported `zmq_ipc` detector plugin asks an external process what is in each frame. The probe answers that on demand, so the NVR itself does the tracking, the recording, the severity and the MQTT publishing — the whole path `test_delivery` and `test_media` skip by writing straight to `spotter.event.test_seed`.

Written in Rust, the only service in the repo that is not Bun: the ZeroMQ binding panics under Bun (`unsupported uv function: uv_async_init`), and a second JS runtime beside Bun invites someone to write a service on it. A pure-Rust ZMQ implementation keeps the image at 9.65 MB with no runtime at all, and everything builds inside Docker so no toolchain reaches a developer machine or a node.
