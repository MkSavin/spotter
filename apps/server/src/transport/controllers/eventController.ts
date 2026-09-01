import type { DeliveryEvent } from '@spotter/transport'
import {
  bufferToJson,
  deliveryStreams,
  eventCode,
  type MediaRequest,
  type MediaWant,
  mediaStreams,
  resolveSource,
  type StreamMessageController,
  safeParseSpotterEvent,
} from '@spotter/transport'
import type { ServerContext } from '../../context'
import { eventsRepo } from '../../db/repository'
import { shouldDeliver } from '../../delivery/shouldDeliver'

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

  // Persisted either way — the policy governs delivery, not history, so a
  // filtered event still shows up in /event_info and the feed. Returning here
  // also skips the eager snapshot below, which is the point: there is no reason
  // to make the NVR fetch a frame nobody will be shown.
  if (!shouldDeliver(event, context.config.delivery?.policy)) {
    logger.debug('Skipped delivery: NVR classified it as a detection')
    return
  }

  const delivery: DeliveryEvent = { eventId: event.id, event, action }

  await producer.publish(deliveryStreams.deliveryEvent, delivery)

  logger.debug(`Published delivery.event (${action})`)

  if (event.type !== 'end') return

  // Clip is requested on demand (event.clip). `hasSnapshot` is not checked:
  // Frigate writes the snapshot as tracking ends, so it is still false here.
  const want: MediaWant[] = ['snapshot']

  const source = resolveSource(event)

  const request: MediaRequest = { eventId: event.id, source, want }
  await producer.publish(mediaStreams.mediaRequest(source), request)

  logger.debug('Published eager media request (snapshot)')
}
