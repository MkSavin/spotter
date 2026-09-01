---
"@spotter/transport": patch
---

fix: recover when Redis disappears mid-read

A consumer could stop consuming for good and give no sign of it. Restarting the Redis *container* — an image update, not a blip — left every service alive, healthy to every check, and reading nothing. Events piled up in the streams with nobody to take them.

The cause was not the missing consumer groups the earlier fix addressed. A blocking `XREADGROUP` already in flight when the server dies never settles at all: it neither resolves nor rejects, so the read loop parks on the `await` forever. No error is raised, which is why the NOGROUP recovery never ran — it was never reached. The healthcheck could not see it either, since its `PING` runs on a different connection that reconnects perfectly well.

The read now carries a deadline of `BLOCK` plus a grace margin, turning silence into an error the loop can act on: the connection is replaced, and the existing NOGROUP branch then recreates the groups the restarted Redis lost. Measured against a real container, recovery goes from never to a few seconds, and the whole sequence is visible in the log.

Found by the new end-to-end suite, which was written expecting a different bug.
