---
"@spotter/forwarder": patch
---

fix: `spotter tunnel` no longer stops silently on an existing tunnel

Reconfiguring a tunnel that was already set up left the old ssh process running on the previous unit file, and a failing `systemctl` was swallowed by a bare `.quiet()` — the command appeared to do nothing after the last prompt. The service is now restarted rather than merely enabled, systemctl errors are reported, and verification waits for a real Redis PONG instead of an open socket. Any command that throws now prints the reason instead of exiting without output.
