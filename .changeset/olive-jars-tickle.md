---
"@spotter/transport": patch
---

fix: do not let an example's `# hint` become a config value

The `.env` examples annotate their settings inline (`VIDEO_CODEC=hevc # h264 | hevc`). Both Bun's `--env-file` and compose's `env_file` strip that before the process sees it, so this was never breaking a normal deployment — but a value injected any other way (compose `environment:`, a shell export, CI) is passed through verbatim, and the hint silently becomes the value, failing enum validation and falling back to a default without a word.

`env.enum`, `env.number`, `env.boolean` and `env.stringArray` now drop a trailing hint themselves. `env.string` deliberately does not: it carries secrets and URLs, where a hash is a legitimate character and truncating one would be worse than the problem being guarded against. Only a hash preceded by whitespace counts, so a URL fragment survives either way.

The examples no longer carry inline hints at all — the option lists moved to the line above, where no parser has to be trusted — and `install.ts` strips any that remain when it generates a real `.env`.
