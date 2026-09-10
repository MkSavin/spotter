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
 * Returns as soon as the export is accepted; waiting would outlast the reclaim
 * window. See docs/foundings/redis-streams.md.
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
