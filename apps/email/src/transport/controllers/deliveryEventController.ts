import {
  type StreamMessageController,
  bufferToJson,
  eventCode,
  safeParseDeliveryEvent,
} from '@spotter/transport'
import type { TransportContext } from '../../context'
import { sendEmailAction } from '../actions/sendEmailAction'

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

  await sendEmailAction(delivery, { ...context, logger })
}
