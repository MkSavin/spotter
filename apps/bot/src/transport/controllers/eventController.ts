import {
  type KafkaMessageController,
  bufferToJson,
  intervalHeartbeat,
} from '@spotter/transport'
import type { Message } from 'kafkajs'
import type { TransportContext } from '../../context'
import { actualizeEventAction } from '../actions/actualizeEventAction'
import { eventCode } from '../helpers/eventCode'
import { resolveNvrMedia } from '../helpers/resolveNvrMedia'
import { parseSpotterEvent } from '../parsing/parseSpotterEvent'

export const eventController: KafkaMessageController<TransportContext> = async (
  payload,
  context,
): Promise<void> => {
  const { topic, message, heartbeat } = payload
  const { config, producer, logger: baseLogger } = context

  const value = bufferToJson(message.value)

  if (!value) {
    return
  }

  const event = parseSpotterEvent(value)

  if (!event) {
    return
  }

  const formattedDate = new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(event.startTime * 1000))

  const logger = baseLogger.sub(
    topic,
    `${eventCode(event.id)} ${formattedDate} [${event.type}]`,
  )

  const nextContext = { ...context, logger }

  await intervalHeartbeat(heartbeat, config.kafka, async () => {
    if (event.type !== 'end') {
      await actualizeEventAction(event, nextContext)
      return
    }

    const mediaTuple = await resolveNvrMedia(event, context)

    await actualizeEventAction(event, nextContext, mediaTuple)

    if (!mediaTuple.hasClip && !mediaTuple.hasSnapshot) {
      logger.debug(
        'Media is not available for event. Skipping media request step...',
      )
      return
    }

    logger.debug('Requesting media for an event...')

    const message: Message = {
      value: JSON.stringify({
        eventId: event.id,
        clipUrl: mediaTuple.clip?.url,
        snapshotUrl: mediaTuple.snapshot?.url,
        endpointAuthorization: mediaTuple.endpointAuthorization,
      }),
    }

    await producer.send({
      topic: 'spotter.event.media_requested',
      messages: [message],
    })
  })
}
