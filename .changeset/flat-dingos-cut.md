---
'@spotter/frigate': patch
---

Camera health warns once per change instead of every minute. The two conditions are tracked apart, so a camera whose `detection_fps` dips to zero while idle no longer reprints the unchanged warning about another one.

Cameras switched off in the NVR's config are no longer reported at all, and the remaining warnings are `warn`, not `error`: the adapter is working, the NVR is not.
