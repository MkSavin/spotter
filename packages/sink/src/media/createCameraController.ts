import {
  type StreamMessageController,
  bufferToJson,
  mediaStreams,
  safeParseCameraRequest,
} from '@spotter/transport'
import type { SinkConfig } from '../config/sinkConfig'
import type { SinkContext } from '../runtime/context'
import type { MediaProvider } from './MediaProvider'
import { stageMedia, stagedFrameKey } from './stageMedia'

/**
 * Handles `spotter.camera.request.<source>`: resolves the latest frame through
 * the adapter's MediaProvider, stages it into S3 and emits a `CameraStaged`
 * carrying the key plus any correlation ids back to the requesting frontend.
 */
export const createCameraController = <TConfig extends SinkConfig>(
  provider: MediaProvider,
): StreamMessageController<SinkContext<TConfig>> => {
  return async (payload, context) => {
    const { topic, message } = payload
    const { producer, s3, sourceId, config, logger: baseLogger } = context

    const value = bufferToJson(message.value)
    const request = value && safeParseCameraRequest(value)

    if (!request || request.source !== sourceId) {
      return
    }

    if (!s3 || !config.s3) {
      baseLogger.warn(
        'Camera request received but S3 staging is not configured',
      )
      return
    }

    const logger = baseLogger.sub('camera', topic, request.camera)

    const fetchRequest = await provider.resolveFrame(request.camera)

    if (!fetchRequest) {
      logger.debug('Frame could not be resolved')
      return
    }

    const key = stagedFrameKey(
      config.s3.stagingPrefix,
      sourceId,
      request.camera,
    )

    if (!(await stageMedia(s3, key, fetchRequest, 'image/jpeg', logger))) {
      return
    }

    await producer.publish(mediaStreams.cameraStaged, {
      source: sourceId,
      camera: request.camera,
      rawFrameKey: key,
      chatId: request.chatId,
      messageId: request.messageId,
    })

    logger.info(`Staged frame published to "${mediaStreams.cameraStaged}"`)
  }
}
