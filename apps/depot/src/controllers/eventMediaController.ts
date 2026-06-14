import { type StreamMessageController, bufferToJson } from '@spotter/transport'
import {
  type EventMediaPayload,
  eventMediaAction,
} from '../actions/eventMediaAction'
import type { CoreContext } from '../context'

export const eventMediaController: StreamMessageController<
  CoreContext
> = async (payload, context) => {
  const { topic, message } = payload
  const { producer, logger: baseLogger } = context

  const value = bufferToJson(message.value)

  if (!value) {
    return
  }

  const actionPayload: EventMediaPayload = {
    eventId: value.eventId ?? '',
    eventCode: value.eventId?.split('-').at(1) ?? 'unknwn',
    clipUrl: value.clipUrl ?? undefined,
    snapshotUrl: value.snapshotUrl ?? undefined,
    endpointAuthorization: value.endpointAuthorization,
  }

  const logger = baseLogger.sub('action', topic, actionPayload.eventCode)

  if (!actionPayload.clipUrl && !actionPayload.snapshotUrl) {
    return
  }

  logger.verbose('Action contents:', actionPayload)

  const result = await eventMediaAction(actionPayload, {
    ...context,
    logger,
  })

  if (!result) {
    return
  }

  logger.verbose('Back-message contents: ', result)

  await producer.publish('spotter.event.media_processed', result)

  logger.info('Back-message sent to stream "spotter.event.media_processed"')
}
