---
'@spotter/frigate': patch
'@spotter/telegram': patch
---

A skipped event is logged as a single message line and a summary of the fields that matter, rather than the full payload with `before` and a stack trace of our own parser.

An event with neither snapshot nor clip is marked once — `🙈 Без снимка и видео` instead of two adjacent marks.
