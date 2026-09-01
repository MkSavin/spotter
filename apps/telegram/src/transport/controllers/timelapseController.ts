import {
  bufferToJson,
  type StreamMessageController,
  safeParseTimelapseFailed,
  safeParseTimelapseProgress,
  safeParseTimelapseReady,
} from '@spotter/transport'
import type { TransportContext } from '../../context'
import { timelapseWaitsRepo } from '../../db/repository'
import {
  timelapseFailedAction,
  timelapseProgressAction,
  timelapseReadyAction,
} from '../actions/timelapseAction'

/** Consumes `spotter.timelapse.progress`: keeps a long wait looking alive. */
export const timelapseProgressController: StreamMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const { topic, message } = payload

  const value = bufferToJson(message.value)
  if (!value) return

  const progress = safeParseTimelapseProgress(value)
  if (!progress) return

  // Nothing to repaint: the request came from another frontend.
  if (progress.chatId === undefined || progress.messageId === undefined) return

  timelapseWaitsRepo.markStarted(
    context.db,
    progress.camera,
    progress.start,
    new Date(progress.startedAt),
  )

  await timelapseProgressAction(
    {
      camera: progress.camera,
      start: progress.start,
      end: progress.end,
      startedAt: progress.startedAt,
      chatId: String(progress.chatId),
      messageId: progress.messageId,
    },
    { ...context, logger: context.logger.sub(topic, progress.camera) },
  )
}

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

  timelapseWaitsRepo.settle(context.db, ready.camera, ready.start)

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

  // `failed` carries no span, so every wait on that camera is settled: one of
  // them is this, and a wait for an export that failed is not worth keeping.
  timelapseWaitsRepo.settle(context.db, failed.camera)

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
