---
"@spotter/depot": minor
"@spotter/server": minor
"@spotter/telegram": minor
"@spotter/transport": minor
---

Long event clips now reach Telegram whole or in a few parts instead of dozens: depot caps resolution, frame rate and CRF, and cuts by keyframe size up to the 50 MB upload limit.
Clip sizes travel in the contract, and the bot uploads large clips outside the Redis entry with resumable downloads, because its link to S3 is unstable.
An optional self-hosted Bot API (`./spotter up --botapi`) raises the limit to 2 GB; a clip that still does not fit gets a link to the web app.
  