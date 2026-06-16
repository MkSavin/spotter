import {
  type StreamMessageController,
  bufferToJson,
  mediaStreams,
  safeParseCameraStaged,
} from '@spotter/transport'
import { cameraStagedAction } from '../actions/cameraStagedAction'
import type { CoreContext } from '../context'

/**
 * Consumes `spotter.camera.staged`: transcodes the raw camera frame referenced
 * by S3 key and publishes `CameraProcessed` on
 * `spotter.camera.frame_processed`.
 */
export const cameraStagedController: StreamMessageController<
  CoreContext
> = async (payload, context) => {
  const { topic, message } = payload
  const { producer, logger: baseLogger } = context

  const value = bufferToJson(message.value)
  const staged = value && safeParseCameraStaged(value)

  if (!staged) {
    return
  }

  const logger = baseLogger.sub('action', topic, staged.camera)

  logger.verbose('Action contents:', staged)

  const result = await cameraStagedAction(staged, { ...context, logger })

  if (!result) {
    return
  }

  logger.verbose('Back-message contents: ', result)

  await producer.publish(mediaStreams.cameraProcessed, result)

  logger.info(`Back-message sent to stream "${mediaStreams.cameraProcessed}"`)
}
