import {
  bufferToJson,
  type StreamMessageController,
  safeParseTimelapseFailed,
  safeParseTimelapseReady,
} from '@spotter/transport'
import type { TransportContext } from '../../context'
import {
  timelapseFailedAction,
  timelapseReadyAction,
} from '../actions/timelapseAction'

/** Consumes `spotter.timelapse.ready`: presigns the video and delivers it. */
export const timelapseReadyController: StreamMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const { topic, message } = payload
  const { logger: baseLogger, s3, config } = context

  const value = bufferToJson(message.value)
  if (!value) return

  const ready = safeParseTimelapseReady(value)
  if (!ready) return

  // Nowhere to deliver it: the request came from something else.
  if (ready.chatId === undefined) return

  const videoUrl = s3.presign(ready.videoKey, {
    expiresIn: config.presignExpiry,
  })

  const logger = baseLogger.sub(topic, ready.camera)

  await timelapseReadyAction(
    {
      camera: ready.camera,
      start: ready.start,
      end: ready.end,
      speed: ready.speed,
      videoUrl,
      chatId: String(ready.chatId),
      messageId: ready.messageId,
    },
    { ...context, logger },
  )
}

/** Consumes `spotter.timelapse.failed`: tells the user it is not coming. */
export const timelapseFailedController: StreamMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const { topic, message } = payload
  const { logger: baseLogger } = context

  const value = bufferToJson(message.value)
  if (!value) return

  const failed = safeParseTimelapseFailed(value)
  if (!failed) return
  if (failed.chatId === undefined) return

  const logger = baseLogger.sub(topic, failed.camera)

  await timelapseFailedAction(
    {
      camera: failed.camera,
      reason: failed.reason,
      chatId: String(failed.chatId),
      messageId: failed.messageId,
    },
    { ...context, logger },
  )
}
