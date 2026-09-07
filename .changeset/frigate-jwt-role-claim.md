---
'@spotter/frigate': patch
---

fix: put the claims Frigate actually requires in the token

A token without a `role` claim is refused outright — `if "role" not in token.claims: return fail_response` — so authentication failed with a perfectly correct secret, which made the secret look like the problem. The role comes from `FRIGATE_AUTH_ROLE`, defaulting to `admin` because exports and manual events are admin-only.

`exp` and `iat` are whole seconds now. Frigate compares them as integers, and `Date.now() / 1000` is fractional.

`normalizeHostUrl` dropped the trailing slash only for hosts without a port: its character class had no `:`, so `http://frigate:5000/` kept the slash and every request went to `//api/...`. Rewritten without a regex over the whole URL, still by hand rather than through `new URL()`, which would discard a path prefix behind a reverse proxy.
