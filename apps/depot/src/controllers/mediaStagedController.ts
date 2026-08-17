import {
  bufferToJson,
  mediaStreams,
  type StreamMessageController,
  safeParseMediaStaged,
} from '@spotter/transport'
import { mediaStagedAction } from '../actions/mediaStagedAction'
import type { CoreContext } from '../context'

/**
 * Consumes `spotter.media.staged`: transcodes the raw event media referenced by
 * S3 key and publishes `MediaProcessed` (processed S3 keys) on
 * `spotter.event.media_processed`.
 */
export const mediaStagedController: StreamMessageController<
  CoreContext
> = async (payload, context) => {
  const { topic, message } = payload
  const { producer, logger: baseLogger } = context

  const value = bufferToJson(message.value)
  const staged = value && safeParseMediaStaged(value)

  if (!staged) {
    return
  }

  if (!staged.rawClipKey && !staged.rawSnapshotKey) {
    return
  }

  const logger = baseLogger.sub('action', topic, staged.eventId)

  logger.verbose('Action contents:', staged)

  // A transient failure propagates out of the action: the regulator skips the
  // XACK, so the entry stays pending and the reaper retries it. Only a
  // permanent failure returns empty and is reported as final below.
  const result = await mediaStagedAction(staged, { ...context, logger })

  if (!result) {
    await producer
      .publish(mediaStreams.mediaProgress, {
        eventId: staged.eventId,
        stage: 'failed',
        reason: 'Не удалось перекодировать видео',
      })
      .catch(() => undefined)
    await producer.publish(mediaStreams.mediaProcessed, {
      eventId: staged.eventId,
    })
    return
  }

  logger.verbose('Back-message contents: ', result)

  await producer.publish(mediaStreams.mediaProcessed, result)

  logger.info(`Back-message sent to stream "${mediaStreams.mediaProcessed}"`)
}
