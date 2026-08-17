---
"@spotter/forwarder": patch
---

fix: `spotter down <service>` stopped the whole node

`down`, `up`, `ps`, `recreate` and `update` dropped their arguments without a word, so naming a service did nothing and the command ran against everything. They now accept a service name — `down` maps to `stop`, since removing the container is not what stopping one service means. Commands that genuinely take no arguments reject extras instead of ignoring them, and docker's own flags are no longer mistaken for service names.
