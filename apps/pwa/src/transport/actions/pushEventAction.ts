import type { DeliveryEvent } from '@spotter/transport'
import type { TransportContext } from '../../context'
import { notifiedEventsRepo, recentEventsRepo } from '../../db/repository'
import type { FeedEntryStored } from '../../render/feedEntry'
import { renderEventNotification } from '../../render/notification'

const RECENT_LIMIT = 200

/**
 * Media keys arrive one delivery at a time — the snapshot first, the clip once
 * transcoding finishes — and each carries only its own. Merging rather than
 * replacing keeps the earlier key: overwriting left every event that had a
 * video with no image to show.
 */
const cacheEvent = (
  context: TransportContext,
  delivery: DeliveryEvent,
): void => {
  const previous = recentEventsRepo.get(context.db, delivery.eventId)
    ?.payload as FeedEntryStored | undefined

  const stored: FeedEntryStored = {
    event: delivery.event,
    clipKey: delivery.clipKey ?? previous?.clipKey,
    snapshotKey: delivery.snapshotKey ?? previous?.snapshotKey,
  }
  recentEventsRepo.save(context.db, delivery.eventId, stored, RECENT_LIMIT)
}

/**
 * Only `create` notifies; `update`/`media` refresh the feed without buzzing.
 * `claim` is atomic, so a reclaim never double-pushes.
 */
export const pushEventAction = async (
  delivery: DeliveryEvent,
  context: TransportContext,
): Promise<void> => {
  const { logger, db, catalog, config, coalescer } = context
  const { eventId, event, action } = delivery

  cacheEvent(context, delivery)

  if (action !== 'create') {
    logger.debug(`no push for ${eventId} (action ${action})`)
    return
  }

  if (!notifiedEventsRepo.claim(db, eventId)) {
    logger.debug(`skip push for ${eventId} (already notified)`)
    return
  }

  try {
    const source = event.source ?? config.source
    const cameraLabel = catalog.cameraLabel(source, event.camera, 'камера')
    const payload = renderEventNotification(
      eventId,
      event,
      catalog,
      source,
      config.timezone,
    )

    await coalescer.push(eventId, event.camera, cameraLabel, payload)
    logger.debug(`pushed ${eventId}`)
  } catch (error) {
    notifiedEventsRepo.release(db, eventId)
    throw error
  }
}
