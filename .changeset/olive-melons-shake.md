---
"@spotter/telegram": patch
---

fix: accept multi-day timelapse periods and stop the dialog freezing

`28.08 09:00 - 31.08 22:00` did nothing at all. Two separate faults met on that input.

The period parser only ever understood a window inside a single day, so anything spanning midnight was rejected. It now takes a date on each side — `28.08 09:00 - 31.08 22:00`, or `28.08-31.08` for whole days — and `позавчера` joins the named days.

Worse, the rejection was invisible. A dialog step that takes only buttons had no text handler, and the engine passed the message on instead of answering it: no error, no progress, nothing to react to. Since the speed step is button-only, a typed answer there vanished and the dialog looked frozen. Any step without a text handler now replies rather than staying silent, which fixes the whole class rather than this one command.

Common periods are offered as buttons — last 24 hours, today, the two days before it, last 6 hours. Each label carries the actual date instead of the word behind it, because "вчера" read a day later means a different day, and an export runs for minutes before anyone finds out it covered the wrong one.
