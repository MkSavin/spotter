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

/**
 * Pre-flights an event's clip/snapshot against the NVR: fetches only the media
 * the event advertises, reports which actually exist (`.ok`), and surfaces the
 * request's Authorization header so depot can reuse it for the real download.
 * Response bodies are released — only existence and the auth header are needed.
 */
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

  // We only need existence (.ok) and the request's auth header here; the actual
  // download happens in depot. Release the unconsumed response bodies so the
  // underlying connections are not leaked. `.url` stays available afterwards.
  void clipResponse?.body?.cancel().catch(() => undefined)
  void snapshotResponse?.body?.cancel().catch(() => undefined)

  return {
    clip: clipResponse,
    snapshot: snapshotResponse,

    hasClip,
    hasSnapshot,

    endpointAuthorization:
      clipRequest.headers.get('Authorization') ?? undefined,
  }
}
