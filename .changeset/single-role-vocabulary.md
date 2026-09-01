---
'@spotter/transport': minor
'@spotter/server': patch
'@spotter/telegram': patch
---

refactor: reduce the role vocabulary and username normalisation to a single definition in `@spotter/transport`, so access checks in server and telegram no longer rely on local copies of `ROLE_RANK`
