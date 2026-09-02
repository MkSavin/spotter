---
'@spotter/pwa': patch
'@spotter/transport': patch
---

fix: stop 500-ing the PWA login. A request without a usable `Host` header broke static serving with `Invalid URL`, and the server answered 500. `CommandBus` no longer spins a hot loop while Redis loads its AOF
