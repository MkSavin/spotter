import {
  bufferToJson,
  type StreamMessageController,
  safeParseTimelapseFailed,
  safeParseTimelapseReady,
} from '@spotter/transport'
import type { TransportContext } from '../../context'
import { timelapsesRepo } from '../../db/repository'
import { dispatchNotification } from '../../push/dispatch'
import { renderTimelapseNotification } from '../../render/notification'

const REASONS: Record<string, string> = {
  empty: 'за этот период нет записей',
  rejected: 'NVR не смог собрать экспорт',
  timeout: 'экспорт не завершился вовремя',
}

/** A finished export: record the key so the list can hand out a video. */
export const timelapseReadyController: StreamMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const value = bufferToJson(payload.message.value)
  if (!value) return

  const ready = safeParseTimelapseReady(value)
  if (!ready) return

  timelapsesRepo.settle(context.db, {
    camera: ready.camera,
    start: ready.start,
    end: ready.end,
    speed: ready.speed,
    state: 'ready',
    videoKey: ready.videoKey,
  })

  const label = context.catalog.cameraLabel(
    ready.source,
    ready.camera,
    ready.camera,
  )

  await dispatchNotification(
    context,
    renderTimelapseNotification(label, { ready: true }),
    `timelapse:${ready.camera}`,
  )

  context.logger.debug(`timelapse ready for ${ready.camera}`)
}

/** A failed export: keep the reason so the card can say why. */
export const timelapseFailedController: StreamMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const value = bufferToJson(payload.message.value)
  if (!value) return

  const failed = safeParseTimelapseFailed(value)
  if (!failed) return

  // `failed` carries no span: the adapter reports the camera and why. Settle
  // every run of that camera still waiting, since one of them is this.
  const affected = timelapsesRepo.failRunning(
    context.db,
    failed.camera,
    failed.reason,
  )

  // Nothing was waiting: a failure for an export this instance never tracked
  // is not worth waking a device for.
  if (affected > 0) {
    const label = context.catalog.cameraLabel(
      failed.source,
      failed.camera,
      failed.camera,
    )

    await dispatchNotification(
      context,
      renderTimelapseNotification(label, {
        ready: false,
        reason: REASONS[failed.reason] ?? failed.reason,
      }),
      `timelapse:${failed.camera}`,
    )
  }

  context.logger.debug(
    `timelapse failed for ${failed.camera}: ${failed.reason}`,
  )
}
