---
'@spotter/transport': patch
---

test: follow an event all the way to a recipient's chat

The rig now covers the last stretch, the one a seeded event could never reach: the domain mints a code, the fake Bot API hands the bot a real `/login` message as though a person typed it, the code is redeemed, and a detection staged on the NVR arrives as a message in that chat.

Without the ability to put words in a user's mouth this was untestable — no recipient exists until someone redeems a code from a genuine chat, and with no recipient an event has nowhere to go. The stand-in gained a `/__send` endpoint for exactly that.

The rig also brings up the PWA, so `/user_sign`'s one-tap login link is exercised against a real instance announcing its own address.

`compose up` now passes `--build`. A four-hour-old image of the Bot API stand-in is what made the first delivery run fail: compose happily reused it, and the test ran against code that was not the code in the tree.
