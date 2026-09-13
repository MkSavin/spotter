import {
  bufferToJson,
  type StreamMessageController,
  safeParseMediaStaged,
} from '@spotter/transport'
import type { CoreContext } from '../context'
import type { TranscodeQueue } from '../jobs/TranscodeQueue'

/**
 * Consumes `spotter.media.staged`: hands the transcode to the queue and returns,
 * so the entry is acked in milliseconds however long the encode takes.
 */
export const createMediaStagedController = (
  queue: TranscodeQueue,
): StreamMessageController<CoreContext> => {
  return async (payload, context) => {
    const { topic, message } = payload
    const { logger: baseLogger } = context

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

    await queue.accept(staged, logger)
  }
}
