---
'@spotter/transport': patch
---

`./spotter dlq` works on an ingest node, where Redis is named `local-redis`: the command used to read an empty database in silence and report that there was nothing there. It also lists pending entries (PEL) — an outage shorter than the retry budget leaves everything there while the dead-letter stream stays empty.
