---
'@spotter/pwa': patch
'@spotter/transport': patch
---

Исправлен вход в PWA: запрос без пригодного заголовка `Host` ронял раздачу статики с `Invalid URL`, и сервер отвечал 500. `CommandBus` больше не крутит горячий цикл, пока Redis грузит AOF
