import {
  eventCode,
  parsedController,
  safeParseDeliveryEvent,
} from '@spotter/transport'
import type { TransportContext } from '../../context'
import { deliveryEventAction } from '../actions/deliveryEventAction'

export const deliveryEventController = parsedController(
  safeParseDeliveryEvent,
  async (delivery, context: TransportContext, { topic }) => {
    const logger = context.logger.sub(
      topic,
      eventCode(delivery.eventId),
      delivery.action,
    )

    await deliveryEventAction(delivery, { ...context, logger })
  },
)
