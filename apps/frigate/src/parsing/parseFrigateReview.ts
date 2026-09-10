import type { EventSeverity } from '@spotter/transport'

/**
 * Frigate's own verdict, with the owner's zones and filters already applied —
 * better than re-deriving it from a score threshold here.
 */
export type ReviewVerdict = {
  severity: EventSeverity
  /** Tracked-object ids this review covers — our `SpotterEvent.id`s. */
  eventIds: string[]
}

/** Maps a raw `frigate/reviews` payload; `null` when it says nothing usable. */
export const parseFrigateReview = (contents: any): ReviewVerdict | null => {
  const review = contents?.after ?? contents?.before
  if (!review) return null

  const severity = review.severity
  if (severity !== 'alert' && severity !== 'detection') return null

  const eventIds = review.data?.detections
  if (!Array.isArray(eventIds) || eventIds.length === 0) return null

  return {
    severity,
    eventIds: eventIds.filter((id: unknown): id is string => !!id),
  }
}
