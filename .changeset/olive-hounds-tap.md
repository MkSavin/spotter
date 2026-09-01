---
"@spotter/pwa": patch
---

feat: notify when a timelapse is ready

An export takes minutes, and until now the only way to learn it had finished was to keep the timelapse screen open — closing the app meant coming back to check by hand.

The notification bypasses the coalescer deliberately. That exists to collapse a storm of events on one camera into a single "N событий", which is right for detections and wrong here: an export is one deliberate request, and folding its result away would lose the only signal the user asked for. It is tagged per camera instead, so a later result replaces an earlier one rather than stacking.

A failure for an export this instance was not tracking pushes nothing — there is nobody to tell, and waking a device over someone else's export is noise.
