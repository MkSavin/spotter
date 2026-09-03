---
'@spotter/telegram': minor
'@spotter/pwa': minor
---

feat: hand the access code to the web app in one tap

`/user_sign` now prints the code on its own line, with nothing else inside the tag: a tap copies exactly what the web app's field expects. It used to be wrapped as `/login <code>`, so copying brought the command along and it had to be edited out by hand — in the app where the code is least convenient to retype.

Where a PWA is running, the message also carries `…/authorize?code=…`. Opening it fills the code in and submits it, then strips it from the address bar with `replaceState`: the code is single use and has nothing to gain from sitting in history, a bookmark, or a screenshot. An install that is already signed in drops the code the same way rather than leaving it in the URL, since the login page never renders there.

The bot learns the address from the PWA's own heartbeat (`details.url`, from `PUBLIC_URL`) rather than a second copy in its own config, which would drift the first time one of them moved. No PWA, a silent one, or a code bound to a `@username` — which a device can never redeem — means no link offered.
