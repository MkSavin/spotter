import {
  bufferToJson,
  type StreamMessageController,
  safeParseNotificationSuspend,
} from '@spotter/transport'
import type { SinkConfig } from '../config/sinkConfig'
import type { SinkContext } from '../runtime/context'
import type { NotificationSuspender } from './NotificationSuspender'

/** Handles `spotter.notifications.suspend.<source>` by asking the NVR. */
export const createSuspendController = <TConfig extends SinkConfig>(
  suspender: NotificationSuspender,
): StreamMessageController<SinkContext<TConfig>> => {
  return async (payload, context) => {
    const { topic, message } = payload
    const { sourceId, logger: baseLogger } = context

    const value = bufferToJson(message.value)
    const request = value && safeParseNotificationSuspend(value)

    if (!request || request.source !== sourceId) return

    const logger = baseLogger.sub('suspend', topic, request.camera)

    // Thrown errors are what keep the entry pending for a retry, so nothing is
    // caught here: a suspend that never reached the NVR should be retried.
    await suspender.suspend(request.camera, request.minutes)

    logger.info(
      request.minutes > 0
        ? `Suspended ${request.camera} for ${request.minutes} min`
        : `Lifted suspension on ${request.camera}`,
    )
  }
}
