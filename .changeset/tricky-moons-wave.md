---
"@spotter/transport": patch
---

test: compose-level smoke over the real images

The in-process suite composes controllers and never starts a container, so a whole category of failure was invisible to it: a broken Dockerfile, a missing environment variable, a healthcheck that never goes green, a service that cannot reach a dependency by container name. Those are deployment bugs, and they only appear at deployment.

The smoke brings up both shapes — single-node, and ingest+cloud bridged by the forwarder — from the same Dockerfiles that ship, on a real Redis, MinIO and mosquitto, with real migrations. Only the NVR is faked, as a container the services reach by name like any other. It checks that every service becomes healthy on its own healthcheck, that none crash-loops, that the adapter reaches the NVR and publishes its catalog, and that the catalog arrives at the domain — which on the split shape holds only if the forwarder really carries the stream.

`spotter-telegram` is deliberately excluded: grammY is built with a bare token and no `apiRoot`, so the container would dial api.telegram.org for real. Adding production configuration solely to make a test possible is the wrong trade, and the bot's logic is already covered in-process.

Kept out of `bun test` — it takes minutes and needs images built first (`bun run smoke:build`, then `bun run test:smoke`). Without them it skips with a hint rather than failing.
