---
'@spotter/transport': minor
'@spotter/sink': minor
'@spotter/telegram': minor
'@spotter/frigate': patch
---

feat: warn when an NVR stops sending events

An adapter whose source goes quiet was indistinguishable from a healthy one: it stays connected, passes its healthcheck and reports a green heartbeat while the NVR behind it has stopped publishing. A break went unnoticed for a day that way, with the bot saying nothing. Adapters now report when they last saw an event, and `/status` leads with a warning after six hours of silence instead of showing a green tick.

fix: subscribe to MQTT topics one at a time

A broker refusing a single topic (an ACL, a topic its version does not know) failed the whole batch, so an optional subscription could take the essential one down with it. Refusals are now logged and skipped; only a node where every topic fails still errors out.

Container logs are capped and rotated (3 × 10 MB per service). The default json-file driver keeps one unbounded file and discards it when a container is recreated — which is when its history is most wanted.
