import {
  type DeliveryEvent,
  eventCode,
  parsedController,
  safeParseDeliveryEvent,
} from '@spotter/transport'
import type { TransportContext } from '../../context'
import { URL_LIMIT } from '../../extension/innoxious/InnoxiousMedia'
import { deliveryEventAction } from '../actions/deliveryEventAction'

/**
 * Whether the clip has to travel as bytes through this process: over what
 * Telegram fetches by URL, yet within what it takes as an upload. Unknown is
 * taken as yes. Larger than the limit is settled with a caption edit, and
 * smaller is a URL Telegram fetches itself: both are quick.
 */
export const needsUpload = (
  delivery: DeliveryEvent,
  uploadLimit: number,
): boolean => {
  if (delivery.action !== 'media' || !delivery.clipKey) return false
  const sizes = delivery.clipParts
    ? (delivery.clipPartBytes ?? [])
    : [delivery.clipBytes]
  const head = sizes[0]
  return head === undefined || (head > URL_LIMIT.video && head <= uploadLimit)
}

export const deliveryEventController = parsedController(
  safeParseDeliveryEvent,
  async (delivery, context: TransportContext, { topic }) => {
    const logger = context.logger.sub(
      topic,
      eventCode(delivery.eventId),
      delivery.action,
    )

    // Bytes take minutes on a flaky link, longer than the reclaim window: the
    // queue owns that work and the entry is acked right away.
    if (needsUpload(delivery, context.config.telegram.uploadLimit)) {
      await context.deliveries.accept(delivery, { ...context, logger })
      return
    }

    await deliveryEventAction(delivery, { ...context, logger })
  },
)
