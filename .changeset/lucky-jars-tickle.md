---
"@spotter/telegram": patch
---

feat: ask for command arguments step by step instead of erroring

Telegram's command menu launches a command with no arguments and offers no way to add them first, so every command that required one answered the menu with "Неверный список аргументов" — the standard way of invoking it was guaranteed to fail.

Missing arguments are now collected one question at a time: buttons where the set of values is known (cameras from the catalog, roles, users already bound locally), a typed reply where it is not. Typing the whole thing still works, and a partial command only asks for the rest — `/user_promote @vasya` goes straight to the role. Commands declare arguments as data, so the parser, the validation, the keyboard and the printed signature all come from one place and cannot drift apart.

The dialog engine is deliberately general rather than a one-off for arguments — steps, pagination, back, cancel, TTL and stale-keyboard handling live in `dialog/`, and argument collection is one definition on top of it. `@grammyjs/conversations` would have been the obvious choice, but its replay model requires wrapping every side effect in `conversation.external()`, which here means nearly every line of the existing handlers, plus reinstalling `hydrate`/`parse-mode` inside each conversation and reaching sessions indirectly.

Progress is kept in SQLite, so a restart mid-wizard resumes where the user left off instead of discarding the answers. The TTL runs from the last reply rather than the start, since a wizard that survives restarts can legitimately stay open a while. Storage failures are logged and swallowed: durability must not cost the conversation.

Fixes found while auditing the result: completing a dialog re-checks the caller's role, since a dialog outlives the request that opened it and a revoked admin would otherwise still execute the command; user-supplied values are escaped before going into HTML, as an unescaped `<` made Telegram reject the whole reply and the user saw nothing at all; and an optional argument now opts in to being asked with `ask`, which makes `user_sign`'s prompt reachable while leaving `test_media` and `test_delivery` on their defaults.
