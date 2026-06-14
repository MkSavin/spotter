import { type StreamMessageController, bufferToJson } from '@spotter/transport'
import {
  type CameraFramePayload,
  cameraFrameAction,
} from '../actions/cameraFrameAction'
import type { CoreContext } from '../context'

export const cameraFrameController: StreamMessageController<
  CoreContext
> = async (payload, context) => {
  const { topic, message } = payload
  const { producer, logger: baseLogger } = context

  const value = bufferToJson(message.value)

  if (!value) {
    return
  }

  const actionPayload: CameraFramePayload = {
    cameraCode: value.cameraCode ?? '',
    chatId: value.chatId ?? undefined,
    messageId: value.messageId ?? undefined,
    frameUrl: value.frameUrl ?? undefined,
    endpointAuthorization: value.endpointAuthorization,
  }

  const logger = baseLogger.sub('action', topic, actionPayload.cameraCode)

  const result = await cameraFrameAction(actionPayload, {
    ...context,
    logger,
  })

  if (!result) {
    return
  }

  logger.verbose('Back-message contents: ', result)

  await producer.publish('spotter.camera.frame_processed', result)

  logger.info('Back-message sent to stream "spotter.camera.frame_processed"')
}
