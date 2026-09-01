---
'@spotter/telegram': patch
---

fix: make the `sent_at` migration work on a populated table — SQLite rejects a non-constant DEFAULT in `ALTER TABLE ADD COLUMN` once the table has rows
