import {
  type KafkaMessageController,
  bufferToJson,
  intervalHeartbeat,
} from '@spotter/transport'
import type { Message } from 'kafkajs'
import {
  type CameraFramePayload,
  cameraFrameAction,
} from '../actions/cameraFrameAction'
import type { CoreContext } from '../context'

export const cameraFrameController: KafkaMessageController<
  CoreContext
> = async (payload, context) => {
  const { topic, message, heartbeat } = payload
  const { producer, config, logger: baseLogger } = context

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

  await intervalHeartbeat(heartbeat, config.kafka, async () => {
    const result = await cameraFrameAction(actionPayload, {
      ...context,
      logger,
    })

    if (!result) {
      return
    }

    logger.verbose('Back-message contents: ', result)

    const message: Message = {
      value: JSON.stringify(result),
    }

    const sent = await producer.send({
      topic: 'spotter.camera.frame_processed',
      messages: [message],
    })

    logger.info(
      `Back-message send to topic "${sent.at(0)?.topicName ?? 'unknown'}"`,
    )
  })
}
