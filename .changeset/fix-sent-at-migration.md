---
'@spotter/telegram': patch
---

Исправлена миграция `sent_at`: SQLite отвергает non-constant DEFAULT в `ALTER TABLE ADD COLUMN`, если в таблице уже есть строки
