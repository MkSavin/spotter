---
'@spotter/telegram': minor
---

feat: rate-limit commands that reach the NVR. A repeat in the same chat is dropped (3 s by default, 60 s for `/timelapse`); commands that only read local state stay unthrottled
