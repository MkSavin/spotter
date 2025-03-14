import {
  type KafkaMessageController,
  bufferToJson,
  intervalHeartbeat,
} from '@spotter/transport'
import {
  type EventMediaPayload,
  eventMediaAction,
} from '../actions/eventMediaAction'
import type { CoreContext } from '../context'
import type { Message } from 'kafkajs'

export const eventMediaController: KafkaMessageController<CoreContext> = async (
  payload,
  context,
) => {
  const { topic, message, heartbeat } = payload
  const { producer, config, logger: baseLogger } = context

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

  await intervalHeartbeat(heartbeat, config.kafka, async () => {
    const result = await eventMediaAction(actionPayload, {
      ...context,
      logger,
    })

    if (!result) {
      return
    }

    logger.verbose('Back-message contents: ', result)

    const message: Message = {
      value: JSON.stringify(result),
    }

    const sent = await producer.send({
      topic: 'spotter.event.media_processed',
      messages: [message],
    })

    logger.info(
      `Back-message send to topic "${sent.at(0)?.topicName ?? 'unknown'}"`,
    )
  })
}
