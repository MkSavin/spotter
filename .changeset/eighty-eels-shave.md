---
"@spotter/transport": patch
"@spotter/telegram": patch
"@spotter/server": patch
"@spotter/pwa": patch
"@spotter/email": patch
---

refactor: share CatalogCache and catalogController from transport

The catalog controller was byte-identical in telegram, pwa and email, and four near-identical `CatalogCache` copies had already started drifting apart in comments and helpers. Both now live in `@spotter/transport`, where the rest of the catalog contract already sits, so a change to label resolution is one edit instead of four.
