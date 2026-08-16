---
"@spotter/transport": minor
"@spotter/sink": minor
"@spotter/telegram": minor
"@spotter/forwarder": minor
"@spotter/depot": patch
---

feat: real progress for a requested clip

The "Видео" button now moves through its actual stages (запрошено → скачивается → конвертируется) instead of showing one frozen label until the video lands. A clip that fails or takes too long ends with a retry button and the reason, so a stuck request is something the user can act on rather than a spinner that never stops.
