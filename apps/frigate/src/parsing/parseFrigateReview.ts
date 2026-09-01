import type { EventSeverity } from '@spotter/transport'

/**
 * The severity Frigate assigned to a review item, keyed by the tracked-object
 * ids it covers.
 *
 * A review is Frigate's own verdict on a stretch of activity: it has already
 * applied the zones, object filters and required-zone rules the owner set up,
 * and marks the result `alert` or `detection`. Reading it is strictly better
 * than re-deriving the same judgement from a score threshold here — and it is
 * configured where the owner expects to configure it, in Frigate's own UI.
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
