import {
  bufferToJson,
  type StreamMessageController,
  safeParseTimelapseRequest,
  timelapseStreams,
} from '@spotter/transport'
import type { SinkConfig } from '../config/sinkConfig'
import type { SinkContext } from '../runtime/context'
import type { TimelapseTracker } from './TimelapseTracker'

/**
 * Handles `spotter.timelapse.request.<source>`: asks the NVR to start the
 * export and hands the job to the tracker.
 *
 * Deliberately returns as soon as the export is accepted. Waiting for it here
 * would hold the stream entry pending well past `reclaimMinIdleMs`, and the
 * reaper would hand the same request to another consumer — producing a second
 * export of the same span.
 */
export const createTimelapseController = <TConfig extends SinkConfig>(
  tracker: TimelapseTracker,
): StreamMessageController<SinkContext<TConfig>> => {
  return async (payload, context) => {
    const { topic, message } = payload
    const { producer, s3, sourceId, config, logger: baseLogger } = context

    const value = bufferToJson(message.value)
    const request = value && safeParseTimelapseRequest(value)

    if (!request || request.source !== sourceId) return

    if (!s3 || !config.s3) {
      baseLogger.warn(
        'Timelapse request received but S3 staging is not configured',
      )
      return
    }

    const logger = baseLogger.sub('timelapse', topic, request.camera)

    if (request.end <= request.start) {
      logger.warn('Rejecting an empty span')
      await producer.publish(timelapseStreams.failed, {
        source: sourceId,
        camera: request.camera,
        reason: 'empty',
        chatId: request.chatId,
        messageId: request.messageId,
      })
      return
    }

    await tracker.start(request, logger)
  }
}
