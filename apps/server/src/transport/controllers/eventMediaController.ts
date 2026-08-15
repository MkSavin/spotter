import {
  bufferToJson,
  type DeliveryEvent,
  deliveryStreams,
  eventCode,
  type StreamMessageController,
  safeParseMediaProcessed,
} from '@spotter/transport'
import type { ServerContext } from '../../context'
import { eventsRepo } from '../../db/repository'

export const eventMediaController: StreamMessageController<
  ServerContext
> = async (payload, context): Promise<void> => {
  const { topic, message } = payload
  const { logger: baseLogger, db, producer } = context

  const value = bufferToJson(message.value)
  if (!value) return

  const processed = safeParseMediaProcessed(value)
  if (!processed) return

  const logger = baseLogger.sub(topic, eventCode(processed.eventId))

  const event = eventsRepo.find(db, processed.eventId)

  if (!event) {
    logger.debug('No event stored for media_processed. Skipping...')
    return
  }

  const spotterEvent = {
    id: event.id,
    source: event.source ?? undefined,
    camera: event.camera,
    label: event.label,
    startTime: event.startTime,
    endTime: event.endTime,
    score: event.score,
    stationary: event.stationary,
    hasClip: event.hasClip,
    hasSnapshot: event.hasSnapshot,
    type: event.type,
  }

  const delivery: DeliveryEvent = {
    eventId: event.id,
    event: spotterEvent,
    clipKey: processed.clipKey,
    snapshotKey: processed.snapshotKey,
    action: 'media',
  }

  await producer.publish(deliveryStreams.deliveryEvent, delivery)

  logger.debug('Published delivery.event (media)')
}
