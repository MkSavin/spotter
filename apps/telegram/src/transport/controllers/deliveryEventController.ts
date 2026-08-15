import {
  bufferToJson,
  eventCode,
  type StreamMessageController,
  safeParseDeliveryEvent,
} from '@spotter/transport'
import type { TransportContext } from '../../context'
import { deliveryEventAction } from '../actions/deliveryEventAction'

export const deliveryEventController: StreamMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const { topic, message } = payload
  const { logger: baseLogger } = context

  const value = bufferToJson(message.value)
  if (!value) return

  const delivery = safeParseDeliveryEvent(value)
  if (!delivery) return

  const logger = baseLogger.sub(
    topic,
    eventCode(delivery.eventId),
    delivery.action,
  )

  await deliveryEventAction(delivery, { ...context, logger })
}
