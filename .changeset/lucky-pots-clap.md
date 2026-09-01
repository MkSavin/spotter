---
"@spotter/pwa": patch
---

fix: keep the snapshot on a card whose event also has a clip

Every event with a video showed a placeholder instead of its image. The snapshot and the clip arrive as separate `media` deliveries — the clip last, since transcoding a video takes longer — and each carries only its own key. The feed cache replaced the stored row wholesale, so the clip's delivery wrote `snapshotKey: undefined` over the image that had already arrived. Keys are now merged into what is already cached.
