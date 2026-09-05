---
'@spotter/transport': minor
'@spotter/telegram': patch
'@spotter/pwa': patch
'@spotter/sink': patch
---

refactor: share the guards every controller and domain call repeated

Nine stream controllers opened with the same four lines — decode the buffer, bail on empty, run the schema, bail on null — and eight call sites wrapped `commandBus.send` in the same try/catch. Both are now single helpers: `parsedController` in the regulator, `trySendCommand` alongside `CommandBus`, plus `askDomain` in the telegram command framework for the two answers every command shares.

The point is less the lines saved than the guards no longer being a matter of discipline: a controller cannot forget to validate, and a command cannot forget that `send` throws when the domain is unreachable.

Writing tests for the wrapper surfaced a bug the hand-written version had everywhere: `bufferToJson` throws on malformed JSON rather than returning null, so the `if (!value) return` guard never covered it. Such a message burned all five delivery attempts before reaching the dead-letter stream. `parsedController` drops it on the first pass — a body that is not JSON will not become JSON on a retry.

`CommandReply` turned out to be exported already, so the `Awaited<ReturnType<typeof context.commandBus.send>>` in eight files was never necessary.
