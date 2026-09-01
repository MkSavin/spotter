# @spotter/forwarder

## 1.4.6

### Patch Changes

- 32d9796: Обновление рантайма до Bun 1.4
- Updated dependencies [6fb558c]
- Updated dependencies [714cf4e]
- Updated dependencies [044e6ae]
- Updated dependencies [fdd83e2]
- Updated dependencies [18a45ec]
  - @spotter/transport@1.7.0

## 1.4.5

### Patch Changes

- a53eb49: fix: survive a restart of any other service at any time
  
  Watchtower can restart anything at any moment, so every service has to tolerate every other one disappearing under it. Several could not, and the failures shared one shape: the process stayed alive and the container stayed "running" while the service did nothing at all — so the restart policy never fired and the problem was only visible to users.
  
  **A Redis client that outlives its connection timeout is finished.** Measured against a real server: an outage under ~10s is absorbed by the offline queue and never surfaces, but a longer one puts the client in a state it never leaves — Redis came back and every command still failed, indefinitely. `maxRetries` does not change this; the two configurations were compared directly and neither recovers. Only a new client does, which is why recreating the container was the one thing that ever worked. `RedisConnection` now owns the client and rebuilds it on a dead connection, recovering in about a second, and all sixteen call sites use it.
  
  **A consumer group that disappears never comes back.** A Redis restored without its data answers every `XREADGROUP` with `NOGROUP`, and the read loop retried that forever, once a second, with no possible outcome. The loop now recognises it and recreates the groups.
  
  **A wedged service was indistinguishable from a working one.** No `spotter-*` container had a healthcheck. Each now refreshes a marker file only while Redis actually answers it, so a service that stops working goes stale and gets restarted; a brief blip stays well inside the threshold.
  
  **A clip request did not survive the bot.** The wait lived in memory, so a restart left the "⏳" button frozen with no way to retry even after the video arrived. Waits are persisted and released on startup as a retry.
  
  Depot also sweeps temp directories left by a killed predecessor — each run creates a fresh one, so the orphans accumulated — and gets a 45s stop grace period, since ffmpeg cannot finish inside Docker's default 10s.
- a53eb49: feat: build timelapses over a chosen period
  
  `/timelapse` asks for a camera and a speed with buttons and takes the period as text — `сегодня`, `вчера`, `15.08`, or `15.08 09:00-18:00`. The period is read in the bot's own timezone; parsing it as UTC would have shifted every export by the offset, silently returning the wrong hours.
  
  **Two speeds, not a number.** Frigate's export API accepts exactly `realtime` and `timelapse_25x` — verified against the v0.17.0 source, and the open request for a per-export factor is still unimplemented. What the second one compresses to is set by `record.export.timelapse_args` in the NVR's config and applies globally, so the button says "ускоренно" rather than promising a multiplier this side cannot know.
  
  **An export is not a download.** It re-encodes hours of recordings and runs for minutes, well past the regulator's five-minute reclaim window. Waiting for it inside the request handler would leave the entry pending until the reaper handed it to another consumer, which would start the same export a second time. So the adapter acknowledges as soon as the NVR accepts the job, and a tracker polls it to completion, stages the result into S3 and publishes `spotter.timelapse.ready` — or `.failed` with a reason the user can act on, rather than a message that never updates.
  
  Started exports are recorded on a volume and resumed on startup: a restart mid-encode would otherwise leave the NVR producing a file nobody is waiting for. The forwarder carries the new streams both ways, since on a split deployment the bot and the adapter sit on different nodes. The finished file is fetched from Frigate's nginx — the export record's `video_path` points inside the container — and deleted from the NVR once it is safely in S3.
- a53eb49: fix: recover the NVR catalog without restarting the adapter
  
  Restarting a cloud service left it showing "неизв. камера" indefinitely, and nothing brought the names back — the only cure found in practice was recreating `spotter-frigate`.
  
  Three things had to line up for that. The `spotter.catalog.<source>` key belongs to the ingest node's Redis and deliberately does not cross the forwarder, so a cloud consumer's `bootstrap` never finds it. Its consumer group is created at `$`, so it only ever sees snapshots published after it started. And the catalog was published exactly once per adapter process — the refresh added earlier only republishes on change, and a camera list that never changes never triggers one, which closed the last route back.
  
  Consumers now ask: `spotter.catalog.request` is answered by the owning adapter with a republish, the forwarder carries it down to the ingest node, and `bootstrap` falls back through the local key, a copy persisted in SQLite, and finally the request. The adapter also force-publishes every few quiet refreshes, so a consumer that missed both still converges within the hour.
- Updated dependencies [a53eb49]
- Updated dependencies [a53eb49]
- Updated dependencies [a53eb49]
  - @spotter/transport@1.6.0

## 1.4.4

### Patch Changes

- dbb2afa: fix: install only the dependencies each image actually uses
  
  Every Dockerfile ran an unfiltered `bun install`, so each backend image downloaded the PWA's frontend toolchain — vite, tailwind and lightningcss's native prebuilds. The arm64 leg then failed extracting `lightningcss-linux-arm64-musl`, a package none of those apps import. The install stage now takes the package name as a build argument and passes it to `--filter`, which drops the telegram image from the full dependency tree to 81 packages and leaves the workspace symlinks intact.

## 1.4.3

### Patch Changes

- a96d810: fix: doctor reported a healthy Frigate as broken
  
  The check truncated `/api/config` at 400 bytes and then looked for `cameras` in what was left — on Frigate 0.17 that key sits further in, so a perfectly good NVR came back as a failure. The response is now parsed inside the container, and the check reports the actual camera count and Frigate version. A 401 gets its own hint, and a config with no cameras is a warning rather than a pass.

## 1.4.2

### Patch Changes

- b64b90c: fix: `spotter down <service>` stopped the whole node
  
  `down`, `up`, `ps`, `recreate` and `update` dropped their arguments without a word, so naming a service did nothing and the command ran against everything. They now accept a service name — `down` maps to `stop`, since removing the container is not what stopping one service means. Commands that genuinely take no arguments reject extras instead of ignoring them, and docker's own flags are no longer mistaken for service names.

## 1.4.1

### Patch Changes

- a43b136: fix: `spotter tunnel` no longer stops silently on an existing tunnel
  
  Reconfiguring a tunnel that was already set up left the old ssh process running on the previous unit file, and a failing `systemctl` was swallowed by a bare `.quiet()` — the command appeared to do nothing after the last prompt. The service is now restarted rather than merely enabled, systemctl errors are reported, and verification waits for a real Redis PONG instead of an open socket. Any command that throws now prints the reason instead of exiting without output.

## 1.4.0

### Minor Changes

- 9569cee: feat: real progress for a requested clip
  
  The "Видео" button now moves through its actual stages (запрошено → скачивается → конвертируется) instead of showing one frozen label until the video lands. A clip that fails or takes too long ends with a retry button and the reason, so a stuck request is something the user can act on rather than a spinner that never stops.

### Patch Changes

- Updated dependencies [9569cee]
  - @spotter/transport@1.5.0

## 1.3.0

### Minor Changes

- b1fff5c: fix: ingest node visible in /status
  
  Heartbeats now cross the forwarder, and the forwarder reports itself, so
  `/status` lists the ingest services instead of the cloud alone. The unknown
  command handler no longer answers commands that exist.

## 1.2.1

### Patch Changes

- 2a99227: Replace the Makefile with a `spotter` command, and the inter-node VPN with an
  SSH tunnel.
  
  `./spotter` (and `spotter.cmd` on Windows) is a thin launcher over
  `.integration/cli.ts`. The node mode now lives in `.env` as `SPOTTER_MODE`, so
  `up`, `ps`, `logs` and the rest no longer need `MODE=`. Everything the Makefile
  did is covered, plus `spotter compose <args>` passes anything through to
  `docker compose`. `GPU=1` and `WATCHTOWER=0` became `--no-gpu` and
  `--no-watchtower`; GPU is now on by default on ingest, since transcoding without
  it is several times slower.
  
  The inter-node VPN is replaced by an SSH tunnel under systemd. It reaches the
  same goal — the cloud Redis stays bound to loopback and the ingest forwarder
  gets to it — without a kernel module, obfuscation parameters that must match
  byte for byte on both sides, or a VPN container whose lifecycle a desktop client
  owns. SSH is already on every server.
  
  `spotter install ingest` sets the tunnel up itself: it finds the docker bridge
  address, generates a restricted key, installs and starts the service, verifies
  the port and fills in `REDIS_REMOTE_URL`. The one manual step left is pasting
  the printed line into the cloud node's `authorized_keys`. `--no-tunnel` skips
  it for a hand-rolled setup, and `spotter tunnel` runs the same dialog later
  against an existing `.env`.
  
  The optional frontends moved from commented-out compose blocks to compose
  profiles, so `--pwa` and `--email` enable them instead of editing YAML by hand.
  `WATCHTOWER_INTERVAL` became `--watchtower-interval=N`; no operation needs an
  environment prefix any more.
  
  Watchtower moves to the maintained `nickfedor/watchtower` fork. The original
  `containrrr/watchtower` speaks Docker API 1.25, which current engines reject
  with `client version 1.25 is too old`, so auto-updates had silently stopped
  working. The fork keeps the same flags and the same
  `com.centurylinklabs.watchtower.enable` label, so nothing else changes.
  
  The deployment guide is split: `deployment.md` now covers installation only,
  with `tunnel.md` and `operations.md` holding the inter-node channel and the
  day-to-day operations.

## 1.2.0

### Minor Changes

- 6fcfb86: Architectural refactoring

### Patch Changes

- Updated dependencies [6fcfb86]
  - stenograph@1.2.0
  - @spotter/transport@1.2.0

## 1.1.0

### Minor Changes

- 538fb94: Full project architecture rework

### Patch Changes

- Updated dependencies [538fb94]
  - stenograph@1.1.0
  - @spotter/transport@1.1.0
