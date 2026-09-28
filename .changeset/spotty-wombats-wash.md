---
'@spotter/depot': patch
---

Stop the depot tests from depending on file order. `mock.module` in Bun replaces a module for the whole process and never resets between files, so the stubs of `processStaged` and `transcode` leaked into the tests of the real modules whenever those ran later; a new test file shifting the order was enough to fail seven of them in CI. Both stubs are now injected, as `TranscodeQueue` already does, and no `mock.module` is left in the repository.

`splitVideo` also treats a missing part limit as "never cut": `NaN` passed the `<= 0` check and started an ffprobe run on every clip.
