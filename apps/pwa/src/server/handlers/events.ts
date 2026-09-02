import type { CoreContext } from '../../context'
import { recentEventsRepo } from '../../db/repository'
import type { FeedEntry, FeedEntryStored } from '../../render/feedEntry'
import { authorize } from '../auth'
import { json, notFound } from '../http'

const FEED_LIMIT = 100

/**
 * Media points back at this server rather than at a presigned S3 URL: object
 * storage does not answer a browser's cross-origin preflight, which leaves
 * `<img>` blank and `<video>` unplayable. The proxy also keeps the bucket
 * layout and credentials out of the browser.
 */
const toFeedEntry = (eventId: string, stored: FeedEntryStored): FeedEntry => {
  const path = `/api/events/${encodeURIComponent(eventId)}`
  return {
    eventId,
    event: stored.event,
    snapshotUrl: stored.snapshotKey ? `${path}/snapshot` : undefined,
    clipUrl: stored.clipKey ? `${path}/clip` : undefined,
  }
}

/** Returns the cached feed, newest first, with media resolved to presigned URLs. */
export const eventsHandler = (
  request: Request,
  context: CoreContext,
): Response => {
  const auth = authorize(request, context)
  if (!auth.ok) return auth.response

  const rows = recentEventsRepo.list(context.db, FEED_LIMIT)
  const entries = rows.map((row) =>
    toFeedEntry(row.eventId, row.payload as FeedEntryStored),
  )
  return json({ events: entries })
}

export const eventHandler = (
  request: Request,
  eventId: string,
  context: CoreContext,
): Response => {
  const auth = authorize(request, context)
  if (!auth.ok) return auth.response

  const row = recentEventsRepo.get(context.db, eventId)
  if (!row) return notFound('event not found')
  return json(toFeedEntry(eventId, row.payload as FeedEntryStored))
}
