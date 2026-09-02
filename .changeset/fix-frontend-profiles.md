---
'@spotter/pwa': patch
'@spotter/email': patch
---

fix: keep the optional frontends across `spotter update`

The PWA/email choice now lives in `SPOTTER_PROFILES` in `.env`. It used to exist only as a `--pwa`/`--email` flag, so any later command without the flag rebuilt the stack without those services. `spotter-pwa` and `spotter-email` moved from `production.cloud.yml` into a shared `production.frontends.yml`, which also makes them available on a `single` node — the installer offered them there, but nothing defined them. `spotter doctor` now expects whichever frontends are enabled.
