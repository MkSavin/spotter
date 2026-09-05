---
'@spotter/telegram': patch
---

fix: say when an event has no video, instead of silently dropping the button

The "🎬 Видео" button appears only when the NVR closes an event with `has_clip` set. When it does not, the button was simply absent, which is indistinguishable from a broken bot — and the reader has no way to tell that the NVR itself decided there was nothing to offer.

An ended event without a clip now carries `🎞️ Без видео` on its label line. The film reel is deliberately not the button's clapperboard and not the snapshot's `📸`/`🙈`: the clip and the snapshot are independent axes, and an event can lack both, so the marks have to read apart at a glance.

The mark tracks the truth rather than the flag: a clip that arrives anyway clears it, while a delivered snapshot leaves it standing, since a photo says nothing about the video.

`shouldOfferClip` gated the button and had no tests at all. It now has them, alongside its new counterpart `shouldSayClipless`, including a case asserting the two can never both hold — a message must never offer a button while claiming there is nothing to offer.
