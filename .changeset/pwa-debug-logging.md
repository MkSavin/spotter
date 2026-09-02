---
'@spotter/pwa': patch
---

fix: let the PWA log in over plain HTTP, and trace it when it does not

`crypto.randomUUID` exists only in a secure context, so minting the device id threw before the login request was built — no request reached the server, and the user saw "не удалось войти" with an empty network log. It now falls back to `getRandomValues`, and `localStorage` failures (private mode, blocked site data) degrade to an in-memory session instead of throwing. An insecure context is named in the error rather than reported as a bad code.

Adds `PWA_DEBUG`: with it set, the browser traces every request and the container logs each redeem attempt. The flag is served at runtime from `/api/config`, so it can be switched on for a node already deployed without a rebuild.

First tests for `apps/pwa/web` — session, api client and logger — plus server coverage for `/api/config` and body validation.
