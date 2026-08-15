import {
  bufferToJson,
  eventCode,
  type StreamMessageController,
  safeParseDeliveryEvent,
} from '@spotter/transport'
import type { TransportContext } from '../../context'
import { pushEventAction } from '../actions/pushEventAction'

export const deliveryEventController: StreamMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const { topic, message } = payload

  const value = bufferToJson(message.value)
  if (!value) return

  const delivery = safeParseDeliveryEvent(value)
  if (!delivery) return

  const logger = context.logger.sub(
    topic,
    eventCode(delivery.eventId),
    delivery.action,
  )

  await pushEventAction(delivery, { ...context, logger })
}
