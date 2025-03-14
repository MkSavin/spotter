import {
  bufferToJson,
  intervalHeartbeat,
  type KafkaMessageController,
} from '@spotter/transport'
import type { TransportContext } from '../../context'
import { parseSpotterEvent } from '../parsing/parseSpotterEvent'
import { intermediateEventAction } from '../actions/intermediateEventAction'
import { endEventAction } from '../actions/endEventAction'
import dayjs from 'dayjs'
import { resolveFrigateMedia } from '../helpers/resolveFrigateMedia'
import type { Message } from 'kafkajs'
import { Frigate } from '../../framework/api/Frigate'
import { eventCode } from '../helpers/eventCode'

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

  const logger = baseLogger.sub(
    topic,
    `${eventCode(event.id)} ${dayjs.unix(event.startTime).format('YY-MM-DD HH:mm')} [${event.type}]`,
  )

  const nextContext = { ...context, logger }

  await intervalHeartbeat(heartbeat, config.kafka, async () => {
    if (event.type !== 'end') {
      await intermediateEventAction(event, nextContext)
      return
    }

    const mediaTuple = await resolveFrigateMedia(event, context)

    await endEventAction(event, mediaTuple, nextContext)

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
        endpointAuthorization: Frigate.generateJWT(),
      }),
    }

    await producer.send({
      topic: 'spotter.event.media_requested',
      messages: [message],
    })
  })
}
