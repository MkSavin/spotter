import type { SpotterEvent } from '@spotter/transport'
import type { CoreContext } from '../../context'
import { frigateMedia } from '../../framework/api/Frigate'

export type MediaTuple = {
  clip: Response | undefined
  snapshot: Response | undefined

  hasClip: boolean
  hasSnapshot: boolean
}

export const resolveFrigateMedia = async (
  event: SpotterEvent,
  context: CoreContext,
): Promise<MediaTuple> => {
  const clipResponse = event.hasClip
    ? await context.frigate.get(frigateMedia.event.clip, {
        id: event.id,
      })
    : undefined

  const snapshotResponse = event.hasSnapshot
    ? await context.frigate.get(frigateMedia.event.snapshot, {
        id: event.id,
      })
    : undefined

  const hasClip = clipResponse?.status === 200
  const hasSnapshot = snapshotResponse?.status === 200

  context.logger.debug(
    `Clip ${hasClip ? '' : 'NOT '}found. Snapshot ${hasSnapshot ? '' : 'NOT '}found`,
  )

  return {
    clip: clipResponse,
    snapshot: snapshotResponse,

    hasClip,
    hasSnapshot,
  }
}
