import { publishEvent } from '@spotter/sink'
import { bufferToJson, type StreamMessageController } from '@spotter/transport'
import type { CoreContext } from '../../context'
import {
  eventTestAction,
  resolveEventTestPayload,
} from '../actions/eventTestAction'
import { realEventAction } from '../actions/realEventAction'

export const eventTestController: StreamMessageController<CoreContext> = async (
  payload,
  context,
) => {
  const { topic, message } = payload
  const { producer, logger: baseLogger } = context

  const value = bufferToJson(message.value)

  if (!value) {
    return
  }

  // `real` asks Frigate for an actual event, so the clip genuinely exists.
  if (value.mode === 'real') {
    const logger = baseLogger.sub('action', topic, 'real')
    const result = await realEventAction(
      context.config,
      {
        camera: value.camera,
        label: value.label ?? 'person',
        duration: Number(value.duration) || 10,
      },
      logger,
    )
    if (!result) return

    for (const event of result.events) {
      await publishEvent(event, producer)
    }
    logger.debug(`Real event ${result.eventId} sent to stream "spotter.event"`)
    return
  }

  const actionPayload = resolveEventTestPayload(value)

  const logger = baseLogger.sub('action', topic, actionPayload.eventId)

  const event = await eventTestAction(actionPayload)

  if (!event) {
    return
  }

  logger.verbose('Back-message contents: ', event)

  await publishEvent(event, producer)

  logger.debug('Event sent to stream "spotter.event"')
}
