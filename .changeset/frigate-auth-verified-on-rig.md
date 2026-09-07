---
'@spotter/frigate': minor
---

fix: reach an authenticated Frigate, verified against a real one

The rig only ever talked to port 5000, which checks no token at all, so a malformed JWT passed unnoticed. It now runs Frigate with `auth.enabled: true` and a shared secret, and the whole suite passes against it — twelve tests, event to delivered clip, over the authenticated port.

Doing that surfaced what production was hitting:

- **No `role` claim.** Frigate refuses the token before it checks the signature, so no secret could ever have helped. Taken from `FRIGATE_AUTH_ROLE`, `admin` by default.
- **The authenticated port is HTTPS.** 8971 serves a certificate Frigate generates itself; plain HTTP there answers 400, and the certificate is rejected unless `FRIGATE_TLS_INSECURE` says otherwise. Every call to the NVR now goes through one `frigateFetch` that carries both the token and that policy, rather than eleven hand-rolled fetches.

Each failure mode was confirmed against the running NVR: a token without `role`, one signed with a secret carrying a stray newline, and the old hex-encoded signature all return 401; the fixed one returns 200.

`./spotter doctor` sent the raw secret as the bearer token instead of a signed JWT, so it reported a credentials fault against any NVR with auth on.

`FRIGATE_REMOTE_URL` becomes `FRIGATE_URL`, old name still honoured.
