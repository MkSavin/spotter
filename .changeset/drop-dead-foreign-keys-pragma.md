---
'@spotter/server': patch
'@spotter/telegram': patch
---

Убрана нерабочая `PRAGMA foreign_keys`: внешних ключей ни в одной схеме нет, а связи между сервисами SQLite проверить не может
