---
'@spotter/pwa': patch
---

Build the web bundle before running the pwa tests.

`static.test.ts` fetches the SPA shell and the manifest from a real server, so it
needs `web/dist` — which is gitignored and never built in CI, leaving the two
assertions to fail on `text/plain` and 503. The `test` task now depends on
`web:build` through a package-level `turbo.json`, so the bundle exists wherever
the tests run. Other packages keep the root task graph untouched.
