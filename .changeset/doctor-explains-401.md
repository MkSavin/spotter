---
'spotter': patch
---

`./spotter doctor` explains Frigate's authorization refusal instead of repeating it: it compares the secret fingerprints on both sides, names where the NVR takes its own from (env overrides the file), and checks whether any users exist at all.
