---
'spotter': patch
---

`./spotter dlq --replay` actually puts entries back: the Redis calls were made without a service name and failed silently, while the command reported success anyway. Perishable streams (`spotter.heartbeat`, `spotter.media.progress`) are now skipped — their entries go stale within ninety seconds, and replaying one would publish something outdated as current.

`.integration` is included in `tsconfig.json`: the node CLI was never typechecked, which is how this bug reached production.
