---
"@spotter/sink": patch
---

fix: camera list stayed empty until the adapter was restarted

The catalog was published once at startup, so an NVR that was unreachable at that moment left the bot saying "Список камер пока недоступен" indefinitely — and an empty snapshot overwrote a good one. Publishing now retries every minute until the NVR answers, and an empty catalog is never published.
