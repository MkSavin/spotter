---
'@spotter/server': patch
'@spotter/telegram': patch
---

chore: drop the `PRAGMA foreign_keys` that enforced nothing — no schema declares a foreign key, and SQLite cannot check relations that span services
