import type { S3Client } from 'bun'
import type { CoreContext } from '../../context'
import { recentEventsRepo } from '../../db/repository'
import type { FeedEntry, FeedEntryStored } from '../../render/feedEntry'
import { authorize } from '../auth'
import { json, notFound } from '../http'

const FEED_LIMIT = 100

const presign = (
  s3: S3Client,
  key: string | undefined,
  expiresIn: number,
): string | undefined => (key ? s3.presign(key, { expiresIn }) : undefined)

const toFeedEntry = (
  eventId: string,
  stored: FeedEntryStored,
  context: CoreContext,
): FeedEntry => {
  const { s3, config } = context
  return {
    eventId,
    event: stored.event,
    snapshotUrl: presign(s3, stored.snapshotKey, config.presignExpiry),
    clipUrl: presign(s3, stored.clipKey, config.presignExpiry),
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
    toFeedEntry(row.eventId, row.payload as FeedEntryStored, context),
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
  return json(toFeedEntry(eventId, row.payload as FeedEntryStored, context))
}
