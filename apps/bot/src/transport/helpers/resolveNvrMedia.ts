import type { SpotterEvent } from '@spotter/transport'
import type { CoreContext } from '../../context'
import { ResourceType } from '../../endpoint/Resource'

export type MediaTuple = {
  clip: Response | undefined
  snapshot: Response | undefined

  hasClip: boolean
  hasSnapshot: boolean

  endpointAuthorization: string | undefined
}

export const resolveNvrMedia = async (
  event: SpotterEvent,
  context: CoreContext,
): Promise<MediaTuple> => {
  const clipRequest = context.nvr.composeResourceRequest(ResourceType.clip, {
    id: event.id,
  })
  const snapshotRequest = context.nvr.composeResourceRequest(
    ResourceType.snapshot,
    {
      id: event.id,
    },
  )

  const clipResponse = event.hasClip
    ? await context.nvr.fetchRequest(clipRequest)
    : undefined

  const snapshotResponse = event.hasSnapshot
    ? await context.nvr.fetchRequest(snapshotRequest)
    : undefined

  const hasClip = !!clipResponse?.ok
  const hasSnapshot = !!snapshotResponse?.ok

  context.logger.debug(
    `Clip ${hasClip ? '' : 'NOT '}found. Snapshot ${hasSnapshot ? '' : 'NOT '}found`,
  )

  return {
    clip: clipResponse,
    snapshot: snapshotResponse,

    hasClip,
    hasSnapshot,

    endpointAuthorization:
      clipRequest.headers.get('Authorization') ?? undefined,
  }
}
