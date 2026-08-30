# @spotter/sink

## 1.3.4

### Patch Changes

- 45330ee: fix: keep retrying media the NVR has not written yet, stop retrying timeouts
  
  Two opposite mistakes in how the pipeline judged failure, both visible after the forwarder came back and flushed a backlog.
  
  A staging miss was acked as final. Frigate writes media seconds after an event ends and rate-limits under a burst, so most of those misses were temporary — but the entry was gone, and roughly two thirds of the flushed events never got their snapshot. The adapter now rethrows, leaving the entry pending for the reaper; the `failed` progress report still goes out immediately, so the clip button says why instead of spinning.
  
  An ffmpeg timeout, meanwhile, was marked transient and retried. A timeout means the clip is too long or the machine too slow, so every attempt hits the same wall — five deliveries of the same doomed transcode, each occupying a worker. It is final again, which is what `shouldRetryOnCpu` already assumed. A clip that legitimately needs longer wants a higher `VIDEO_TIMEOUT_MS`, kept below `REDIS_RECLAIM_MIN_IDLE_MS`.
- edbd2d6: fix: notice cameras added in the NVR without restarting the adapter
  
  The catalog was published exactly once per process lifetime. `keepCatalogPublished` retried only until the first snapshot landed and then stopped, and `FrigateCatalog` memoized the `/api/config` response forever, so a camera added in Frigate stayed invisible to the bot until `spotter-frigate` was restarted. The schema comment promised "on start and on change", but nothing implemented the second half.
  
  The loop now keeps going after the first success on a slow interval, and `publishCatalog` compares the serialized snapshot against the last one it sent — an unchanged catalog is not republished, so the refresh does not wake every consumer on a timer. The `/api/config` memo gained a TTL, without which the loop would keep re-reading the same cached answer.
  
  `camera_snapshot` also skipped validation entirely when the catalog was empty: the `cameras.length > 0` guard sat in front of the comparison, so any typed name went straight to the NVR.
- Updated dependencies [edbd2d6]
  - @spotter/transport@1.5.5

## 1.3.3

### Patch Changes

- 313ab95: feat: keep snapshots moving while clips transcode
  
  Every depot replica read one `spotter.media.staged` stream, so a couple of long video transcodes occupied every worker and the snapshots queued behind them — and the snapshot is what makes a notification informative in the first place.
  
  Clips now travel on their own `spotter.media.staged.clip` stream, and `DEPOT_LANE` (`all` | `snapshots` | `clips`) picks what a replica consumes. The split has to happen at the stream level rather than by filtering after the read: a consumer never receives a stream it did not register, so a snapshot-only replica cannot pull a clip out of the shared group and drop it. Camera frames ride the snapshot lane, being equally quick and user-facing. The ingest profile now runs two clip workers plus one snapshot worker; single-node keeps the default `all` and is unchanged.
  
  The clip button also read "Конвертируется…" while the job was still waiting for a free worker. Without a percentage nothing is converting yet, so that state now reads "В очереди…" — ffmpeg reports progress the moment it actually starts.
- Updated dependencies [313ab95]
  - @spotter/transport@1.5.3

## 1.3.2

### Patch Changes

- a96d810: fix: camera list stayed empty until the adapter was restarted
  
  The catalog was published once at startup, so an NVR that was unreachable at that moment left the bot saying "Список камер пока недоступен" indefinitely — and an empty snapshot overwrote a good one. Publishing now retries every minute until the NVR answers, and an empty catalog is never published.

## 1.3.1

### Patch Changes

- 1d88f83: fix: requesting a clip that is not ready duplicated the message
  
  When the NVR had no clip yet, the empty result took the create/update path, whose `editMessageText` cannot edit a message that already carries a photo. The failure threw, the entry was redelivered, and the user saw a second copy of the event without its snapshot while the button hung on "processing". An empty result now only repaints the button, and says the clip may simply not be written yet — a retry a little later usually works. A media artifact the NVR refuses is logged at warn instead of debug, so the reason is visible.

## 1.3.0

### Minor Changes

- 9569cee: feat: real progress for a requested clip
  
  The "Видео" button now moves through its actual stages (запрошено → скачивается → конвертируется) instead of showing one frozen label until the video lands. A clip that fails or takes too long ends with a retry button and the reason, so a stuck request is something the user can act on rather than a spinner that never stops.

### Patch Changes

- Updated dependencies [9569cee]
  - @spotter/transport@1.5.0

## 1.2.1

### Patch Changes

- ec9422d: Answer media requests even when the NVR has nothing to give.
  
  `createMediaController` returned silently when staging produced no keys — the
  NVR 404s an event it no longer has, or never had. Nothing was published, so the
  bot's "Видео обрабатывается…" button stayed that way forever, with no timeout to
  clear it. It now publishes a `MediaProcessed` with no keys, and the bot restores
  the "Видео" button instead of leaving the message stuck.
  
  The empty answer is what `test_delivery` exposed — its synthetic ids exist in no
  NVR — but the same path is hit by real events whose recordings have aged out.
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
