---
'@spotter/transport': minor
'@spotter/sink': minor
'@spotter/depot': patch
---

Fix the depot image build. Depot imported `FileJobStore` from `@spotter/sink` without declaring it, and the image installs with `bun install --filter @spotter/depot`, which links only declared packages; locally and in CI every workspace is installed, so the import resolved everywhere except the image.

`FileJobStore` and `JobStore` move to `@spotter/transport` rather than becoming a depot dependency on `@spotter/sink`: they are a generic file-backed store, and the NVR adapter SDK has no place in depot. `@spotter/sink` no longer exports them.

A new repository test checks that every workspace declares each package its source imports, so an undeclared import fails `bun run test` instead of the release build.
