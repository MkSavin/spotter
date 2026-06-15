/**
 * Canonical stream-direction map — the single source of truth for what the
 * forwarder mirrors between the local (ingest) node and the remote (cloud) node.
 *
 * Direction is defined by where a stream is *produced*: the ingest node ingests
 * events and emits media results (UP → remote), while the remote bot issues
 * media and frame requests (DOWN → local).
 */

/** Produced on the ingest node, consumed on the remote — mirrored local → remote. */
export const UP_STREAMS = [
  'spotter.event',
  'spotter.event.media_processed',
  'spotter.camera.frame_processed',
] as const

/** Produced on the remote node, consumed on the ingest node — mirrored remote → local. */
export const DOWN_STREAMS = [
  'spotter.event.media_requested',
  'spotter.camera.frame_requested',
  'spotter.event.test_seed',
] as const
