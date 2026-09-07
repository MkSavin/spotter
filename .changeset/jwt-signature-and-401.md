---
'@spotter/frigate': patch
'@spotter/transport': minor
'@spotter/sink': patch
'@spotter/telegram': patch
---

fix: sign JWTs the way every verifier expects, and say so when the NVR refuses

The adapter signed its Frigate tokens with base64url of the *hex* digest rather than of the raw bytes, producing an 86-character signature where RFC 7515 calls for 43. Our own `verify` repeated the same encoding, so round-trip tests passed and nothing surfaced until a real verifier saw one: switching authentication on in Frigate turned every call into a 401.

A 401 is now told apart from a failed poll. It will not clear on the next attempt and it takes media, catalog and camera counters down together, so `readNvrHealth` reports `unauthorized`, the watcher logs it once per transition instead of once a minute, and the heartbeat carries the flag. `/status` prints it above every other line, because the rest are its symptoms — a source that looks connected while quietly doing nothing was indistinguishable from an outage.

The JWT helper had no tests at all. It has them now, verifying against an independent implementation rather than against itself, which is the only kind of test that would have caught this.
