---
"@spotter/transport": patch
---

fix: survive a Redis restart instead of dying on it

A durable Redis replaying its AOF answers every command with `-LOADING` until it finishes. `XGROUP CREATE` treated that as fatal, so `run()` rejected and the process exited — the forwarder died on exactly the restart its store-and-forward buffer exists to survive, and needed a manual recreate to come back.

Group creation now waits `-LOADING` out (up to two minutes) while any other error still fails fast. The Redis healthchecks were complicit and are fixed too: `redis-cli` exits 0 even on an error reply, so a bare `ping` reported healthy mid-load; they now grep for `PONG`.
