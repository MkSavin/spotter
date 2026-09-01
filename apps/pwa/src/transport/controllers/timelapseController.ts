import {
  bufferToJson,
  type StreamMessageController,
  safeParseTimelapseFailed,
  safeParseTimelapseReady,
} from '@spotter/transport'
import type { TransportContext } from '../../context'
import { timelapsesRepo } from '../../db/repository'

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
  timelapsesRepo.failRunning(context.db, failed.camera, failed.reason)

  context.logger.debug(
    `timelapse failed for ${failed.camera}: ${failed.reason}`,
  )
}
