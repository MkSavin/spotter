---
'@spotter/telegram': minor
'@spotter/frigate': minor
'@spotter/transport': minor
'@spotter/forwarder': patch
---

fix: answer `/test`, including when it refuses

The adapter now publishes the outcome of every probe request to `spotter.probe.result`, and the bot delivers it to the chat that asked — a refusal with its reason, or a confirmation naming the camera and frame count.

Without this the command was quietly broken in exactly the way it exists to catch. A refusal reached only the adapter's log on the ingest node, so an admin running `/test` on a deployment with no probe saw a cheerful "staging a detection" and then nothing at all — indistinguishable from the outage the command is meant to detect. The reply itself crosses the forwarder, or the same silence would return on any split deployment.

`/test` also stops claiming success before the adapter has spoken, and the refusal reasons now say what to do (`./spotter up --probe`) rather than describing the internals.

Adds `docs/testing.md`: the three levels of checking, what `/test` covers, and the two steps a live node needs before it works — the probe profile, and pointing Frigate's own detector config at it.
