/** Mirror of the server's SpotterEvent — kept minimal for the feed UI. */
export type SpotterEvent = {
  id: string
  source?: string
  camera: string
  label: string | null
  startTime: number
  endTime: number | null
  score: number
  stationary: boolean
  hasClip: boolean
  hasSnapshot: boolean
  type: string
}

/** Feed entry from `GET /api/events` — media resolved to presigned URLs. */
export type FeedEntry = {
  eventId: string
  event: SpotterEvent
  snapshotUrl?: string
  clipUrl?: string
}

export type SubscriptionStatus = {
  endpoint: string
  authorized: boolean
  deviceLabel: string | null
}
