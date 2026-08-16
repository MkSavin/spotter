---
"@spotter/forwarder": minor
"@spotter/telegram": patch
---

fix: ingest node visible in /status

Heartbeats now cross the forwarder, and the forwarder reports itself, so
`/status` lists the ingest services instead of the cloud alone. The unknown
command handler no longer answers commands that exist.
