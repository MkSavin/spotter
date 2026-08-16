---
"@spotter/telegram": minor
---

feat: rollout notices for admins

Telegram tracks the version of every service in SQLite and sends admins a silent
notice once a rollout settles. Versions persist, so a restart of the bot itself
reports nothing, and a service updated while the bot was down is still caught.
