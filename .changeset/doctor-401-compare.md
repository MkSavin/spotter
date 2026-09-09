---
'spotter': patch
---

`./spotter doctor` no longer reports matching secrets when the NVR's own secret could not be read: it compares extracted fingerprints rather than substrings, and tells an empty read apart from a found one. The hint about a nonexistent user is gone — Frigate accepts a token for an unknown `sub` too, so that cannot be the reason for a 401.
