---
'@spotter/server': patch
---

Bind the cloud Redis to the tunnel instead of the public internet, and document
joining an ingest node to an existing AmneziaWG deployment.

`production.cloud.yml` published Redis on `6379:6379`, i.e. `0.0.0.0` with no
password — reachable from anywhere the moment the port was open. The published
address is now `${REDIS_BIND:-127.0.0.1}`, so the default is loopback-only and a
two-machine setup sets `REDIS_BIND` to the node's VPN address.

`docs/deployment.md` gains step-by-step instructions for attaching an ingest node
behind NAT to an AmneziaVPN server raised by the desktop client: issuing the peer
config, the `/etc/amnezia/amneziawg/` location `awg-quick` requires, narrowing
`AllowedIPs` from the default `0.0.0.0/0` so camera and S3 traffic stays off the
tunnel, and why `spotter-forwarder` needs no compose change to reach it.
