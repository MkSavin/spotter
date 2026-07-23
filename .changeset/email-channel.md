---
'@spotter/email': minor
---

New optional email frontend (`apps/email`): a headless SMTP consumer of
`spotter.delivery.event` that sends one notification email per event. Meant as a
cheap, additional channel — not the primary frontend (PWA) nor the emergency
guarantee (SMS): email is reachable everywhere with no install and, via a
Russian-provider mailbox, stays available during "whitelist" shutdowns.

Sends only on `create` (no edit-threads), dedups redelivery via a
`notified_events` SQLite ledger (atomic claim, rolled back on SMTP failure so
the regulator retries), presigns the snapshot key into the body and links back
into the web frontend. Labels come from the shared `CatalogCache`; addressing is
channel-local (`EMAIL_RECIPIENTS`, bcc). `EMAIL_MODE=always|fallback` (fallback
reserved for the cross-channel ACK-trigger, not built yet). Ships an
`.env.email.example`, an optional (commented) service in `production.cloud.yml`,
and per-app `AGENTS.md`.
