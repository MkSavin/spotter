---
'@spotter/server': minor
'@spotter/telegram': minor
'@spotter/transport': minor
---

Part B: split `@spotter/bot` into `@spotter/server` (headless domain — event
persistence, media orchestration, recipients/auth, command RPC) and
`@spotter/telegram` (grammY frontend — delivery consumer, rendering, commands,
Telegram-local state, S3 presign).

New `@spotter/transport` delivery contract (`spotter.delivery.*` downstream,
`spotter.command.*` upstream RPC). The domain DB is split: server owns
`recipients`/`access_tokens`/`events`; telegram owns `tg_chats`/`tg_bindings`/
`event_messages`. `apps/bot` is removed; compose/env/docs updated accordingly.
