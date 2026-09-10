---
'@spotter/transport': patch
---

When the secrets match, `./spotter doctor` retries the same token against the NVR's direct address. If it is accepted there, the 401 is not about credentials but about a proxy in front of Frigate keeping the `Authorization` header to itself; doctor names the address that works for `FRIGATE_URL`.
