---
'@spotter/telegram': patch
---

fix: correct the duration of events longer than a day — a copy of `renderEventTiming` took hours modulo 60 and rendered "1 дней 25 ч"
