import type { SpotterEvent } from '@spotter/transport'

/** Stored per event in `recent_events` — the raw material for a feed card. */
export type FeedEntryStored = {
  event: SpotterEvent
  clipKey?: string
  snapshotKey?: string
}

/** Sent to the client — media keys resolved to presigned URLs at read time. */
export type FeedEntry = {
  eventId: string
  event: SpotterEvent
  snapshotUrl?: string
  clipUrl?: string
}
