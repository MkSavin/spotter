---
"@spotter/frigate": patch
---

fix: join an existing broker's docker network

Pointing `MQTT_BROKER` at a broker running in another compose project failed two ways: our own mosquitto still started and collided on port 1883, and the adapter could not resolve the broker's name (`getaddrinfo ESERVFAIL`) because it was not on that network. `MQTT_NETWORK` now names the broker's network to join, and whether we start a broker of our own is decided by `MQTT_NETWORK_EXTERNAL` rather than by the host name — someone else's broker is very often called `mosquitto` too.
