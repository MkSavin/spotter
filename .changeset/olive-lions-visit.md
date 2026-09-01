---
"@spotter/transport": patch
---

docs: rewrite the README for people, not machines

The README read like a specification: architecture diagrams above the fold, a stream inventory, release mechanics. Everything true, nothing that answers the first question a visitor has — what does this do for me, and why would I run it.

It now opens on the thing itself: a person walks through the yard, and seconds later the phone shows which camera, who, and a frame. Then why you would want it over the alternatives, what it looks like in use, and an install that fits in three lines. Badges, a comparison table and the feature tour follow the conventions of the self-hosted projects people actually adopt.

The reference material was moved rather than dropped: the stream inventory now lives in `AGENTS.md` beside the rest of the technical detail, where it is also easier to keep honest.

Docs were audited against the code in the same pass. `CommandBus` and `HeartbeatRegistry` had moved to `@spotter/transport` but the telegram docs still pointed at deleted files; the PWA's `devices` and `timelapses` tables and the timelapse streams were undocumented; the command tables predated the e2e and smoke suites. Every link in the live docs now resolves.
