---
"@spotter/depot": patch
---

fix: GPU transcoding failed with "Encoder not found"

Alpine builds ffmpeg without NVENC, so `hevc_nvenc` was missing even with the GPU passed through correctly and every clip was lost. The depot image now builds on Debian, whose ffmpeg carries the nvidia encoders. On top of that, a missing hardware encoder falls back to the CPU instead of dropping the video — losing the speed-up beats losing the clip.
