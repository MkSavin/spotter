# @spotter/depot

## 1.2.11

### Patch Changes

- e9837f1: fix: stop nvenc falling back to the CPU on every clip
  
  Hardware transcoding never actually ran. Each clip logged `cuda-hevc` immediately followed by `cpu-hevc`, and `nvidia-smi` showed the encoder idle at 0% while the GPU sat at 25% — the decode side working, the encode side untouched. The fallback exists so a broken preset never costs a clip, but it logged at `warn` and the failure looked like slow acceleration rather than no acceleration.
  
  `-hwaccel_output_format cuda` keeps decoded frames in VRAM, which needs a cuda filter chain to hand them to the encoder. There is none, so ffmpeg cannot negotiate a format and fails — notably, Frigate's own presets do not use that flag for encoding either. Decoding stays on the GPU; the frames now reach nvenc in a format it accepts.
  
  Quality presets were also missing entirely for `cuda` and `vaapi`: the switch that maps `VIDEO_QUALITY` onto encoder flags only handled `cpu` and `videotoolbox`, so the setting did nothing on a GPU and nvenc silently used its `p4`/medium default — slower than the CPU it was meant to beat on a small Pascal card. Both accelerations now map quality onto real flags (`-preset:v p1…p4` with `-cq` for nvenc, `-global_quality` for vaapi).
- Updated dependencies [e9837f1]
  - @spotter/transport@1.5.6

## 1.2.10

### Patch Changes

- 45330ee: fix: keep retrying media the NVR has not written yet, stop retrying timeouts
  
  Two opposite mistakes in how the pipeline judged failure, both visible after the forwarder came back and flushed a backlog.
  
  A staging miss was acked as final. Frigate writes media seconds after an event ends and rate-limits under a burst, so most of those misses were temporary — but the entry was gone, and roughly two thirds of the flushed events never got their snapshot. The adapter now rethrows, leaving the entry pending for the reaper; the `failed` progress report still goes out immediately, so the clip button says why instead of spinning.
  
  An ffmpeg timeout, meanwhile, was marked transient and retried. A timeout means the clip is too long or the machine too slow, so every attempt hits the same wall — five deliveries of the same doomed transcode, each occupying a worker. It is final again, which is what `shouldRetryOnCpu` already assumed. A clip that legitimately needs longer wants a higher `VIDEO_TIMEOUT_MS`, kept below `REDIS_RECLAIM_MIN_IDLE_MS`.
- Updated dependencies [edbd2d6]
  - @spotter/transport@1.5.5

## 1.2.9

### Patch Changes

- 313ab95: feat: keep snapshots moving while clips transcode
  
  Every depot replica read one `spotter.media.staged` stream, so a couple of long video transcodes occupied every worker and the snapshots queued behind them — and the snapshot is what makes a notification informative in the first place.
  
  Clips now travel on their own `spotter.media.staged.clip` stream, and `DEPOT_LANE` (`all` | `snapshots` | `clips`) picks what a replica consumes. The split has to happen at the stream level rather than by filtering after the read: a consumer never receives a stream it did not register, so a snapshot-only replica cannot pull a clip out of the shared group and drop it. Camera frames ride the snapshot lane, being equally quick and user-facing. The ingest profile now runs two clip workers plus one snapshot worker; single-node keeps the default `all` and is unchanged.
  
  The clip button also read "Конвертируется…" while the job was still waiting for a free worker. Without a percentage nothing is converting yet, so that state now reads "В очереди…" — ffmpeg reports progress the moment it actually starts.
- Updated dependencies [313ab95]
  - @spotter/transport@1.5.3

## 1.2.8

### Patch Changes

- f6ff724: fix: retry transient media failures instead of acking them away
  
  A failed transcode was indistinguishable from a broken clip: `mediaStagedAction` caught every error, returned empty, and the controller published `media_processed` — so the regulator acked. An S3 blip or a not-yet-visible staged object therefore lost the media for good, bypassing the PEL/reaper/DLQ machinery entirely. S3 reads/writes and ffmpeg timeouts now raise `TransientError` and propagate, leaving the entry pending for the reaper; only genuinely broken media (bad codec, unreadable input) still reports a final miss. Clip and snapshot are judged independently, so a permanent failure of one does not hold back the other.
  
  The dead-letter boundary was also off by one: `deliveries > maxDeliveries` granted a sixth attempt against a documented budget of five, which for a transcode is a wasted full run.
- f6ff724: refactor: read config through resolveConfig and cover the untested paths
  
  `transcode.ts` read eleven env vars at module scope, so the values froze at import time, skipped the redacted startup dump and could not be swapped in tests — which is why the largest file in the repo had the thinnest coverage. They now belong to `config.video`/`config.image` and arrive as an argument.
  
  Test coverage follows the same reasoning: `CommandBus` (RPC correlation, timeout, replies addressed to another replica, junk on the stream) had none despite driving the whole "Видео" button flow, so its timeouts became injectable and it is now covered. The frigate test-seed controller's id/timestamp derivation moved into a pure `resolveEventTestPayload`, and the dead-letter boundary gained a test that pins the exact threshold.
- Updated dependencies [f6ff724]
- Updated dependencies [f6ff724]
  - @spotter/transport@1.5.2

## 1.2.7

### Patch Changes

- 9552750: feat: show transcoding progress on the video button
  
  The button sat on "Конвертируется…" for the whole encode, which on a long clip is indistinguishable from a hang. Depot already had the percentage in its logs, so it now travels on `spotter.media.progress` and the button reads "Конвертируется… 40%". Updates are rounded down to tens and only sent when the number moves, keeping it to at most ten edits per clip; a broken publish is swallowed, since progress must never fail a transcode.
- Updated dependencies [9552750]
  - @spotter/transport@1.5.1

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
