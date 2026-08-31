---
"@spotter/depot": patch
---

fix: stop nvenc falling back to the CPU on every clip

Hardware transcoding never actually ran. Each clip logged `cuda-hevc` immediately followed by `cpu-hevc`, and `nvidia-smi` showed the encoder idle at 0% while the GPU sat at 25% — the decode side working, the encode side untouched. The fallback exists so a broken preset never costs a clip, but it logged at `warn` and the failure looked like slow acceleration rather than no acceleration.

`-hwaccel_output_format cuda` keeps decoded frames in VRAM, which needs a cuda filter chain to hand them to the encoder. There is none, so ffmpeg cannot negotiate a format and fails — notably, Frigate's own presets do not use that flag for encoding either. Decoding stays on the GPU; the frames now reach nvenc in a format it accepts.

Quality presets were also missing entirely for `cuda` and `vaapi`: the switch that maps `VIDEO_QUALITY` onto encoder flags only handled `cpu` and `videotoolbox`, so the setting did nothing on a GPU and nvenc silently used its `p4`/medium default — slower than the CPU it was meant to beat on a small Pascal card. Both accelerations now map quality onto real flags (`-preset:v p1…p4` with `-cq` for nvenc, `-global_quality` for vaapi).
