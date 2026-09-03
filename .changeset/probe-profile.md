---
'@spotter/transport': minor
'@spotter/telegram': minor
'@spotter/frigate': patch
'@spotter/sink': patch
---

feat: ship the probe behind a profile, and shout about it in `/status`

`./spotter up --probe` starts the stub detector on a live node, so a real deployment can be tested the way CI tests it. Everything about it is built to be hard to leave on by accident:

- the profile is off by default, and the choice is **not** persisted to `SPOTTER_PROFILES` the way the frontends are — forgetting a frontend is an annoyance, forgetting the probe leaves the property unwatched;
- the CLI prints a warning on every such start;
- `PROBE_ENDPOINT` is passed for that command only, so the adapter forgets the probe the moment the profile is dropped;
- while it is set, the adapter reports `probeActive` on every heartbeat and `/status` prints **🚨 ДЕТЕКТОР ПОДМЕНЁН** above the source figures.

That last one carries the weight: without it, an admin reads "last event a minute ago" as good news, when the event is one we asked for ourselves. A test that reports on a staged detection while claiming the property is watched is worse than no test.

The probe image also joins the release matrix. It is Rust, so changesets never sees it — the version comes from `Cargo.toml`, and it builds from its own directory rather than the repo root.
