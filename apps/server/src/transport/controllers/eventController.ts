import {
  type MediaRequest,
  type MediaWant,
  type StreamMessageController,
  bufferToJson,
  deliveryStreams,
  eventCode,
  mediaStreams,
  resolveSource,
  safeParseSpotterEvent,
} from '@spotter/transport'
import type { DeliveryEvent } from '@spotter/transport'
import type { ServerContext } from '../../context'
import { eventsRepo } from '../../db/repository'

export const eventController: StreamMessageController<ServerContext> = async (
  payload,
  context,
): Promise<void> => {
  const { topic, message } = payload
  const { producer, logger: baseLogger, db } = context

  const value = bufferToJson(message.value)
  if (!value) return

  const event = safeParseSpotterEvent(value)
  if (!event) return

  const formattedDate = new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(event.startTime * 1000))

  const logger = baseLogger.sub(
    topic,
    `${eventCode(event.id)} ${formattedDate} [${event.type}]`,
  )

  const stored = eventsRepo.find(db, event.id)

  if (stored?.type === 'end') {
    logger.debug('Event has already been ended. Skipping...')
    return
  }

  logger.debug(`Persisting ${event.type} event...`)

  eventsRepo.upsert(db, event)

  const action: DeliveryEvent['action'] =
    event.type === 'start' ? 'create' : 'update'

  const delivery: DeliveryEvent = { eventId: event.id, event, action }

  await producer.publish(deliveryStreams.deliveryEvent, delivery)

  logger.debug(`Published delivery.event (${action})`)

  if (event.type !== 'end') return

  // Only the snapshot is transcoded eagerly; the clip is requested on demand
  // when a recipient taps the "Видео" button (see the event.clip command).
  const want: MediaWant[] = []
  if (event.hasSnapshot) want.push('snapshot')

  if (want.length === 0) {
    logger.debug(
      'Event advertises no snapshot. Skipping eager media request...',
    )
    return
  }

  const source = resolveSource(event)

  const request: MediaRequest = { eventId: event.id, source, want }
  await producer.publish(mediaStreams.mediaRequest(source), request)

  logger.debug('Published eager media request (snapshot)')
}
