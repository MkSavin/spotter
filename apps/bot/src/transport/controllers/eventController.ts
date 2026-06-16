import {
  type MediaRequest,
  type MediaWant,
  type StreamMessageController,
  bufferToJson,
  mediaStreams,
  resolveSource,
  safeParseSpotterEvent,
} from '@spotter/transport'
import type { TransportContext } from '../../context'
import { actualizeEventAction } from '../actions/actualizeEventAction'
import { eventCode } from '../helpers/eventCode'

export const eventController: StreamMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const { topic, message } = payload
  const { producer, logger: baseLogger } = context

  const value = bufferToJson(message.value)

  if (!value) {
    return
  }

  const event = safeParseSpotterEvent(value)

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

  await actualizeEventAction(event, nextContext)

  if (event.type !== 'end') {
    return
  }

  // Lazy staging: ask the owning source's adapter to stage whatever media the
  // event advertises. No NVR pre-flight, no URLs — the adapter resolves and
  // stages, depot transcodes, and media_processed comes back with S3 keys.
  const want: MediaWant[] = []

  if (event.hasClip) {
    want.push('clip')
  }
  if (event.hasSnapshot) {
    want.push('snapshot')
  }

  if (want.length === 0) {
    logger.debug('Event advertises no media. Skipping media request step...')
    return
  }

  const source = resolveSource(event)

  logger.debug('Requesting media for an event...')

  const request: MediaRequest = {
    eventId: event.id,
    source,
    want,
  }

  await producer.publish(mediaStreams.mediaRequest(source), request)
}
