---
'@spotter/transport': minor
'@spotter/server': patch
'@spotter/telegram': patch
---

Словарь ролей и нормализация username сведены к одному определению в `@spotter/transport`: проверки доступа в server и telegram больше не опираются на локальные копии `ROLE_RANK`
