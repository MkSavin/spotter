import {
  type MessageController,
  bufferToJson,
  intervalHeartbeat,
} from '@spotter/transport'
import {
  type CameraFramePayload,
  cameraFrameAction,
} from '../actions/cameraFrameAction'
import type { CoreContext } from '../context'

export const cameraFrameController: MessageController<CoreContext> = async (
  payload,
  context,
) => {
  const { topic, message, heartbeat } = payload
  const { producer, config, logger: baseLogger } = context

  const value = bufferToJson(message.value)

  if (!value) {
    return
  }

  const actionPayload: CameraFramePayload = {
    cameraCode: value.cameraCode ?? '',
    frameUrl: value.frameUrl ?? undefined,
    endpointAuthorization: value.endpointAuthorization,
  }

  const logger = baseLogger.sub('action', topic, actionPayload.cameraCode)

  await intervalHeartbeat(heartbeat, config.action, async () => {
    const result = await cameraFrameAction(actionPayload, {
      ...context,
      logger,
    })

    if (result) {
      logger.verbose('Back-message contents: ', result)

      const message = {
        value: JSON.stringify(result),
      }

      const sent = await producer.send({
        topic: 'spotter.camera.frame_processed',
        messages: [message],
      })

      logger.info(
        `Back-message send to topic "${sent.at(0)?.topicName ?? 'unknown'}"`,
      )
    }
  })
}
