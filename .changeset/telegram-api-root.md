---
'@spotter/telegram': minor
---

feat: let the Bot API be pointed elsewhere, and run the bot in the rig

`TELEGRAM_API_ROOT` sends every grammY call to a given host, and `TELEGRAM_TEST_ENVIRONMENT` switches to Telegram's own test infrastructure. Both are empty by default, so production is unchanged, and the bot warns loudly on startup whenever either is set — a redirected bot that looks normal in the logs is worse than no rig at all.

This is not a knob invented for a test: it is what a self-hosted Bot API server needs, and what Telegram's separate test infrastructure needs. Declining to add it was the wrong call.

The NVR rig now runs `spotter-server` and `spotter-telegram` against a recording Bot API stand-in, so a run exercises the whole deployment and still cannot message a real chat. `/__calls` serves what the bot tried to send.

Delivery to an actual recipient stays uncovered: registration goes through a signed token and a live chat, which is its own piece of work.
