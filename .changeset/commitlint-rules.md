---
'@spotter/server': patch
---

Align commitlint with the commit style actually used in this repo.

`subject-case` rejected `chore(ci): Update packages versions`, the message the
changesets bot writes on every release — so the version PR could never pass the
lint gate. It was not just the bot: 41 of the last 60 commits start the subject
with a capital letter, so the rule contradicted the convention rather than
enforcing it. The rule is off; `agents` joins the allowed types, and
`body-max-line-length` is off because generated changelog bodies paste long
lines verbatim. Malformed messages are still rejected.

`@commitlint/cli` and `@commitlint/config-conventional` were referenced by the
config but never installed, so commit messages could not be checked locally at
all. They are dependencies now, and CI runs `bunx commitlint` from the lockfile
instead of `wagoid/commitlint-github-action`, which kept its own copy and could
not resolve `extends` against ours.
