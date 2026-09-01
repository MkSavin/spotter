---
"@spotter/frigate": patch
---

fix: drop disabled cameras from the catalog

A camera turned off in Frigate stayed in `camera_list`, and a snapshot or timelapse requested against it would never be answered. Disabling a camera does not remove it from `/api/config` — Frigate marks it with `enabled: false` and keeps the section — and the catalog read every key it found there.

Object types are still collected from every camera, disabled ones included: the taxonomy also renders events a camera left behind before it was turned off.
