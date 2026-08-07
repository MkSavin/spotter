---
'@spotter/depot': patch
---

Make NVIDIA acceleration opt-in on the ingest node.

`production.ingest.yml` hardcoded `deploy.resources` and `/dev/nvidia*` device
mappings on both depot replicas, so the whole node failed to start on a machine
without a working driver — even though `VIDEO_ACCELERATION` defaults to `cpu`
and needs no GPU. A stale kernel module was enough to take ingest down with
`nvidia-container-cli: initialization error: nvml error: driver/library version
mismatch`.

The GPU blocks moved to `production.ingest.gpu.yml`, applied with
`make ingest GPU=1`. The base profile now transcodes on the CPU and runs
anywhere.

`install.ts` picks between the two on an ingest node. It probes the card by
starting a throwaway depot container with `--gpus all` — checking for
`nvidia-smi` alone would have passed on exactly the broken setup above — then
writes `VIDEO_ACCELERATION` and brings the stack up with a matching `GPU=1`, so
the flag and the `.env` value can no longer disagree. When the probe fails it
falls back to the CPU and prints why.

`setEnv` no longer eats a trailing `# hint` comment when it rewrites a line.
