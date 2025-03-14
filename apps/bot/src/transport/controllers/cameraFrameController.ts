import {
  bufferToJson,
  intervalHeartbeat,
  type KafkaMessageController,
} from '@spotter/transport'
import type { TransportContext } from '../../context'
import { cameraFrameAction } from '../actions/cameraFrameAction'

export const cameraFrameController: KafkaMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const { topic, message, heartbeat } = payload
  const { config, logger: baseLogger } = context

  const value = bufferToJson(message.value)

  if (!value) {
    return
  }

  const actionPayload = {
    cameraCode: value.cameraCode ?? '',
    frameUrl: value.frameUrl ?? '',
    chatId: value.chatId ?? '',
    messageId: value.messageId ?? undefined,
  }

  if (
    !actionPayload.cameraCode ||
    !actionPayload.frameUrl ||
    !actionPayload.chatId
  ) {
    return
  }

  const logger = baseLogger.sub(topic, actionPayload.cameraCode)

  const nextContext = { ...context, logger }

  await intervalHeartbeat(heartbeat, config.kafka, async () => {
    await cameraFrameAction(actionPayload, nextContext)
  })
}
