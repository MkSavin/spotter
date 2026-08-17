# @spotter/depot

## 1.2.6

### Patch Changes

- dbb2afa: fix: install only the dependencies each image actually uses
  
  Every Dockerfile ran an unfiltered `bun install`, so each backend image downloaded the PWA's frontend toolchain — vite, tailwind and lightningcss's native prebuilds. The arm64 leg then failed extracting `lightningcss-linux-arm64-musl`, a package none of those apps import. The install stage now takes the package name as a build argument and passes it to `--filter`, which drops the telegram image from the full dependency tree to 81 packages and leaves the workspace symlinks intact.

## 1.2.5

### Patch Changes

- 97bc8e0: fix: decide the CPU fallback by how far ffmpeg got, not by its wording
  
  The fallback matched on error phrasing, so a hardware failure it had not seen before ("Conversion failed!") slipped through and the clip was lost instead of transcoding slower. The decision now uses facts the runtime already has: zero frames means ffmpeg died on the device and the CPU is worth a try, while a timeout or a mid-stream failure points at the input and would fail again. The GPU overlay is back to the device list Frigate documents, which is known to work on this hardware.

## 1.2.4

### Patch Changes

- b64b90c: fix: GPU transcoding failed with "Encoder not found"
  
  Alpine builds ffmpeg without NVENC, so `hevc_nvenc` was missing even with the GPU passed through correctly and every clip was lost. The depot image now builds on Debian, whose ffmpeg carries the nvidia encoders. On top of that, a missing hardware encoder falls back to the CPU instead of dropping the video — losing the speed-up beats losing the clip.

## 1.2.3

### Patch Changes

- 9569cee: feat: real progress for a requested clip
  
  The "Видео" button now moves through its actual stages (запрошено → скачивается → конвертируется) instead of showing one frozen label until the video lands. A clip that fails or takes too long ends with a retry button and the reason, so a stuck request is something the user can act on rather than a spinner that never stops.
- Updated dependencies [9569cee]
  - @spotter/transport@1.5.0

## 1.2.2

### Patch Changes

- 084d12a: Replace `/deployment_version` with `/status`, reporting every service instead of
  just the bot.
  
  The old command read the bot's own `package.json`, so it could only ever show
  one version. Services now announce themselves on `spotter.heartbeat` — name,
  version, node and uptime — on start and every 30 seconds; the bot keeps the
  latest report per service and renders them grouped by node.
  
  Carried on a stream rather than a Redis key, because keys do not cross the
  forwarder: a key-based report would leave the cloud bot blind to everything
  running on the ingest node.
  
  A service that dies stops reporting rather than announcing it, so reports older
  than three intervals are shown as offline instead of vanishing — an outage stays
  visible in the output.
  
  Services also report what they run on: the frigate adapter probes the NVR build
  via `/api/version`, depot reports its ffmpeg and the active acceleration, and
  server and telegram report the Redis server version. Probes resolve once and
  swallow their own failures — a broken probe must not cost the heartbeat.
- Updated dependencies [084d12a]
  - @spotter/transport@1.4.0

## 1.2.1

### Patch Changes

- 1777789: Make NVIDIA acceleration opt-in on the ingest node.

  `production.ingest.yml` hardcoded `deploy.resources` and `/dev/nvidia*` device
  mappings on both depot replicas, so the whole node failed to start on a machine
  without a working driver — even though `VIDEO_ACCELERATION` defaults to `cpu`
  and needs no GPU. A stale kernel module was enough to take ingest down with
  `nvidia-container-cli: initialization error: nvml error: driver/library version
mismatch`.

  The GPU blocks moved to `production.ingest.gpu.yml`, applied with
  `make ingest GPU=1`. The base profile now transcodes on the CPU and runs
  anywhere.

  `install.ts` picks between the two on an ingest node. It probes the card by
  starting a throwaway depot container with `--gpus all` — checking for
  `nvidia-smi` alone would have passed on exactly the broken setup above — then
  writes `VIDEO_ACCELERATION` and brings the stack up with a matching `GPU=1`, so
  the flag and the `.env` value can no longer disagree. When the probe fails it
  falls back to the CPU and prints why.

  `setEnv` no longer eats a trailing `# hint` comment when it rewrites a line.

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

## 1.0.2

### Patch Changes

- d7e607b: fix: User authorization caching. DayJS removed
- Updated dependencies [d7e607b]
  - @spotter/transport@1.0.2

## 1.0.1

### Patch Changes

- 44b65ca: fix(bot): bot cluster fixes
