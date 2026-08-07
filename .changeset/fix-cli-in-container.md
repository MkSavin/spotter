---
'@spotter/server': patch
---

Fix the `spotter` CLI inside the container, so `make token` works again.

Two separate failures. `bun build --outfile` emits a plain JS file with no
executable bit and no shebang, so `docker exec spotter-server ./spotter` died
with `exec format`-style `permission denied` (exit 126) — the CLI is now invoked
as `bun spotter`.

Then the database path: the CLI resolved it from `import.meta.dir/../data`,
which is correct in development (`apps/server/src` → `apps/server/data`) but
resolves to `/data` in the image, where the bundle sits at `/app`. That is
outside the mounted volume and unwritable for uid 1000, so every invocation
failed with `EACCES: mkdir '/data'`. The path now probes candidates the same way
`db/client.ts` already resolves migrations, keeping the development layout and
landing on `/app/data` in the container.

`Makefile`, the installer and `docs/deployment.md` were updated to the working
invocation.
