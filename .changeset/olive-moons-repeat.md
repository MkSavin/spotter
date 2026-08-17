---
"@spotter/telegram": patch
"@spotter/depot": patch
"@spotter/email": patch
"@spotter/forwarder": patch
"@spotter/frigate": patch
"@spotter/server": patch
"@spotter/pwa": patch
---

fix: install only the dependencies each image actually uses

Every Dockerfile ran an unfiltered `bun install`, so each backend image downloaded the PWA's frontend toolchain — vite, tailwind and lightningcss's native prebuilds. The arm64 leg then failed extracting `lightningcss-linux-arm64-musl`, a package none of those apps import. The install stage now takes the package name as a build argument and passes it to `--filter`, which drops the telegram image from the full dependency tree to 81 packages and leaves the workspace symlinks intact.
