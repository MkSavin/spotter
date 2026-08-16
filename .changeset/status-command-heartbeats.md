---
'@spotter/transport': minor
'@spotter/telegram': minor
'@spotter/sink': patch
'@spotter/server': patch
'@spotter/depot': patch
'@spotter/pwa': patch
'@spotter/email': patch
---

Replace `/deployment_version` with `/status`, reporting every service instead of
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
