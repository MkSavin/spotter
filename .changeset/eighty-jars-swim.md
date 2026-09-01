---
"@spotter/server": minor
"@spotter/pwa": minor
---

feat: timelapses and user management in the PWA

Both of the remaining gaps between the PWA and the bot, now that a command channel exists.

**Timelapses** get their own screen: camera and speed as buttons, a period as ready-made choices or a custom range. Started exports are recorded in SQLite rather than held in memory, because an export runs for minutes and a restart in between would otherwise lose it — the video would be staged and nobody would be waiting for it. The adapter's `ready` message carries no request id, so correlation is by `camera:start:end`, and making that the row id means a redelivery updates the row instead of adding a duplicate. An export that finishes after the request was lost is recorded anyway. A failure notice carries only the camera, so it settles whatever that camera still has running — never an export already delivered.

**User management** forwards to the domain: list, change role, revoke, mint a code. Nothing is written to domain tables from here, and the admin check in the PWA is a convenience the server re-does against the real recipient. Revoking yourself is refused, since the last admin would lock themselves out.

Two things the domain was missing for this. There was no way to *read* the list of recipients over the bus at all — `user.list` adds it. And `findByRef` resolved a recipient only by Telegram id or username, which a PWA-created recipient has neither of: it could be created and then never managed or revoked. It now also resolves by uuid.
