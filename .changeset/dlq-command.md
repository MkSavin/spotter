---
'spotter': patch
---

`./spotter dlq` lists the entries the regulator gave up on, and `./spotter dlq --replay` puts them back on their original stream. An outage longer than the retry budget (5 attempts, 5 minutes apart) sends every event there, and until now there was no way to get them back out.
