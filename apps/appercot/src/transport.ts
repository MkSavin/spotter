import {
  catalogController,
  catalogUpdatedStream,
  type DeliveryRecipient,
  deliveryStreams,
  heartbeatStream,
  isRole,
  mediaStreams,
  parsedController,
  probeStreams,
  RedisRegulator,
  safeParseCameraProcessed,
  safeParseDeliveryEvent,
  safeParseDeliveryRecipient,
  safeParseHeartbeat,
  safeParseMediaProgress,
  safeParseProbeResult,
  safeParseTimelapseFailed,
  safeParseTimelapseReady,
  timelapseProgressSchema,
  timelapseStreams,
} from '@spotter/transport'
import type { Context } from './context'
import { chatsRepo } from './db/repository'
import { deliverClipProgress, deliverEvent } from './events'
import { syncRole } from './platform'
import { updateRequest } from './requests'

export const updateRecipient = async (
  event: DeliveryRecipient,
  context: Context,
) => {
  const role = event.action === 'update' ? event.role : null
  if (event.action === 'update' && !isRole(role)) return
  const updated = isRole(role) ? role : null
  for (const chat of chatsRepo.forRecipient(context.db, event.recipientUuid)) {
    if (updated && !chat.role) continue
    chatsRepo.update(context.db, chat.id, { role: updated })
    await syncRole(context, chat.id, updated)
  }
}

export const startTransport = (context: Context) =>
  new RedisRegulator<Context>()
    .message(
      deliveryStreams.deliveryEvent,
      parsedController(safeParseDeliveryEvent, deliverEvent),
    )
    .message(
      deliveryStreams.deliveryRecipient,
      parsedController(safeParseDeliveryRecipient, updateRecipient),
    )
    .message(catalogUpdatedStream, catalogController)
    .message(
      heartbeatStream,
      parsedController(safeParseHeartbeat, async (beat, context: Context) =>
        context.heartbeats.apply(beat),
      ),
    )
    .message(
      mediaStreams.mediaProgress,
      parsedController(safeParseMediaProgress, deliverClipProgress),
    )
    .message(
      mediaStreams.cameraProcessed,
      parsedController(
        safeParseCameraProcessed,
        async (frame, context: Context) => {
          await updateRequest(context, frame.requestId, 'frame', {
            message: 'Кадр готов.',
            done: true,
            key: frame.frameKey,
          })
        },
      ),
    )
    .message(
      timelapseStreams.progress,
      parsedController(
        (value) => timelapseProgressSchema.safeParse(value).data,
        async (progress, context: Context) => {
          const minutes = Math.max(
            0,
            Math.floor((Date.now() - progress.startedAt) / 60_000),
          )
          await updateRequest(context, progress.requestId, 'timelapse', {
            message: minutes
              ? `Собирается ${minutes} мин.`
              : 'Экспорт начался.',
            done: false,
          })
        },
      ),
    )
    .message(
      timelapseStreams.ready,
      parsedController(
        safeParseTimelapseReady,
        async (exported, context: Context) => {
          await updateRequest(context, exported.requestId, 'timelapse', {
            message: 'Экспорт готов.',
            done: true,
            key: exported.videoKey,
          })
        },
      ),
    )
    .message(
      timelapseStreams.failed,
      parsedController(
        safeParseTimelapseFailed,
        async (failed, context: Context) => {
          const reasons = {
            empty: 'Нет записей за этот период.',
            rejected: 'NVR отклонил экспорт.',
            timeout: 'Экспорт не завершился вовремя.',
          }
          await updateRequest(context, failed.requestId, 'timelapse', {
            message: reasons[failed.reason],
            done: true,
          })
        },
      ),
    )
    .message(
      probeStreams.result,
      parsedController(
        safeParseProbeResult,
        async (result, context: Context) => {
          await updateRequest(context, result.requestId, 'probe', {
            message: result.staged
              ? 'Проба запущена. Ждём событие от NVR.'
              : `Проба отклонена. ${result.reason ?? ''}`,
            done: true,
          })
        },
      ),
    )
    .run(context, context.config.redis)
