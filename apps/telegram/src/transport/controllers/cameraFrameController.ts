import {
  bufferToJson,
  type StreamMessageController,
  safeParseCameraProcessed,
} from '@spotter/transport'
import type { TransportContext } from '../../context'
import { cameraFrameAction } from '../actions/cameraFrameAction'

export const cameraFrameController: StreamMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const { topic, message } = payload
  const { logger: baseLogger, s3, config } = context

  const value = bufferToJson(message.value)
  if (!value) return

  const processed = safeParseCameraProcessed(value)
  if (!processed) return

  const chatId = processed.chatId
  if (chatId === undefined) return

  const frameUrl = s3.presign(processed.frameKey, {
    expiresIn: config.presignExpiry,
  })

  const actionPayload = {
    cameraCode: processed.camera,
    frameUrl,
    chatId: String(chatId),
    messageId: processed.messageId,
  }

  const logger = baseLogger.sub(topic, actionPayload.cameraCode)

  await cameraFrameAction(actionPayload, { ...context, logger })
}
