---
'@spotter/pwa': patch
---

Build the web bundle before running the tests, and only when it is stale.

`static.test.ts` fetches the SPA shell and the manifest from a real server, so it
needs `web/dist` — which is gitignored and never built in CI, leaving the two
assertions to fail on `text/plain` and 503. A root `pretest` script now builds it
before `bun test` runs.

Building it unconditionally cost ~1s on every run, almost all of it vite's
startup: the build itself takes 14ms. `.integration/rerun.ts` skips a command
when its output is newer than its sources, which drops that to 0.04s when the
bundle is current.
