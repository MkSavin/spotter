# @spotter/forwarder

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
