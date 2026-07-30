import type { DeliveryEvent } from '@spotter/transport'
import type { TransportContext } from '../../context'
import { notifiedEventsRepo, recentEventsRepo } from '../../db/repository'
import type { FeedEntryStored } from '../../render/feedEntry'
import { renderEventNotification } from '../../render/notification'

const RECENT_LIMIT = 200

const cacheEvent = (
  context: TransportContext,
  delivery: DeliveryEvent,
): void => {
  const stored: FeedEntryStored = {
    event: delivery.event,
    clipKey: delivery.clipKey,
    snapshotKey: delivery.snapshotKey,
  }
  recentEventsRepo.save(context.db, delivery.eventId, stored, RECENT_LIMIT)
}

/**
 * Delivery → push. Only `create` produces a notification (one alert per event);
 * `update`/`media` silently refresh the feed cache so an open PWA redraws the
 * card without re-buzzing the device.
 *
 * Dedup (level 1): `notified_events.claim` is atomic, so stream reclaim never
 * double-pushes. Per-device send failures are handled inside the fan-out (dead
 * endpoints pruned, healthy ones kept) — the claim is only released on an
 * unexpected error, so the regulator can retry the whole event.
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
