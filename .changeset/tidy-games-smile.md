---
"@spotter/telegram": patch
---

fix: `/camera_snapshot` without a name, and quieter heartbeat logs

An empty argument reached the lookup and produced "Камера  не найдена" with a blank name; it now asks for a camera and lists the available ones — as does the not-found reply. Heartbeats are no longer logged every 30 seconds per service: only a service appearing or changing version is worth a line.
