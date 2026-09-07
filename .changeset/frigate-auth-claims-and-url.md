---
'@spotter/frigate': minor
---

fix: make Frigate authentication actually work, and rename the URL variable

Three separate faults each produced a 401 with a perfectly correct secret, which is why changing the secret never helped:

- **No `role` claim.** Frigate refuses a token without one outright — `if "role" not in token.claims: return fail_response` — before it ever checks the signature. It now comes from `FRIGATE_AUTH_ROLE`, `admin` by default since exports and manual events require it.
- **Fractional timestamps.** `exp` was `Date.now() / 1000`; Frigate compares integers.
- **Whitespace.** Frigate `.strip()`s the secret it reads from `.jwt_secret` but not the one from `FRIGATE_JWT_SECRET`, so a value copied out of that file carries an invisible newline and signs differently. `FRIGATE_AUTH_*` are trimmed now.

`./spotter doctor` sent the raw secret as the bearer token instead of a signed JWT, so it reported a credentials problem against any NVR with auth enabled. It signs properly now.

`FRIGATE_REMOTE_URL` becomes `FRIGATE_URL` — the address only has to be reachable from the adapter's container, and "remote" read as though it had to be public. The old name is still honoured.

`normalizeHostUrl` stripped a trailing slash only for hosts without a port, so `http://frigate:5000/` sent every request to `//api/...`.
