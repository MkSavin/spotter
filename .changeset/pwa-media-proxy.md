---
'@spotter/pwa': patch
---

fix: show snapshots and play clips in the PWA

Media was handed to the browser as a presigned S3 URL. That is a cross-origin request, and the bucket answers a preflight with no `Access-Control-*` headers at all, so `<img>` stayed blank and `<video>` — which needs Range requests to play and seek — failed outright. The Telegram frontend never hit this: it passes the same URL to Telegram, whose servers fetch it, so no browser and no CORS are involved.

The PWA now streams media through its own API (`/api/events/:id/snapshot`, `/api/events/:id/clip`) with Range support, so seeking works and Safari plays. Storage credentials and the bucket layout no longer reach the browser, and media is subject to the app's own authorization — via `?token=`, since `<img>` and `<video>` cannot send a header.

A key that outlives its object now falls back to the snapshot and then to a placeholder, instead of a broken player, and says which event lost its media when `PWA_DEBUG` is on.
