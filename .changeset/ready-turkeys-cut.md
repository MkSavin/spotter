---
'@spotter/depot': patch
---

Say why a transcode failed. ffmpeg's exit code and `frame= 0` cannot tell a busy GPU from an unsupported input or a missing driver, and the line that can — `OpenEncodeSessionEx failed: out of memory` and its kin — never reached `error.message`, which carries only a truncated tail.

`TranscodeError` now keeps the last stderr lines and ffmpeg's own reading of the input stream, both logged when a preset fails. The input description comes from the `codecData` event, scraped from the stderr the encode already writes: an ffprobe pass per clip would cost a second process every time and still see none of the device-side causes.
