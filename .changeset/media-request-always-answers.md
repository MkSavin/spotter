---
'@spotter/sink': patch
'@spotter/telegram': patch
---

Answer media requests even when the NVR has nothing to give.

`createMediaController` returned silently when staging produced no keys — the
NVR 404s an event it no longer has, or never had. Nothing was published, so the
bot's "Видео обрабатывается…" button stayed that way forever, with no timeout to
clear it. It now publishes a `MediaProcessed` with no keys, and the bot restores
the "Видео" button instead of leaving the message stuck.

The empty answer is what `test_delivery` exposed — its synthetic ids exist in no
NVR — but the same path is hit by real events whose recordings have aged out.
