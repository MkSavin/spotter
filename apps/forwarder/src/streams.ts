/**
 * Canonical stream-direction map — the single source of truth for what the
 * forwarder mirrors between the local (ingest) node and the remote (cloud) node.
 *
 * Direction is defined by where a stream is *produced*. With ingestion AND
 * transcoding on the local node (see production.ingest.yml), only the canonical
 * event, the catalog snapshot and the transcoded media results need to reach the
 * cloud bot; the raw `*.staged` streams stay local (the local depot consumes
 * them). The cloud bot, in turn, issues per-source media/frame requests that are
 * mirrored back down to the owning adapter.
 */

import {
  catalogUpdatedStream,
  eventStreams,
  mediaStreams,
} from '@spotter/transport'

/** Produced on the ingest node, consumed on the remote — mirrored local → remote. */
export const UP_STREAMS = [
  eventStreams.event,
  // Full catalog snapshot on the stream so cloud consumers bootstrap (the
  // `spotter.catalog.<source>` key itself does not cross the forwarder).
  catalogUpdatedStream,
  // Transcoded media results — the local depot produces these; the cloud bot
  // presigns the S3 keys for Telegram.
  mediaStreams.mediaProcessed,
  mediaStreams.cameraProcessed,
] as const

/**
 * Produced on the remote (cloud) node, consumed on the ingest node — mirrored
 * remote → local. The bot issues media/frame requests per source; each source's
 * adapter consumes its own `spotter.{media,camera}.request.<source>` stream, so
 * the forwarder bridges one pair per configured source.
 */
export const downStreams = (sources: string[]): string[] => [
  ...sources.flatMap((source) => [
    mediaStreams.mediaRequest(source),
    mediaStreams.cameraRequest(source),
  ]),
  eventStreams.testSeed,
]
