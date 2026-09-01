import { type CameraRequest, mediaStreams } from '@spotter/transport'
import type { CoreContext } from '../../context'
import { authorize } from '../auth'
import { json, parseBody } from '../http'
import { clipBody, snapshotBody } from '../schemas'

/**
 * Asks the NVR adapter for a camera's latest frame.
 *
 * Published straight to the media pipeline rather than through the command bus:
 * there is no domain state to change, and the frame comes back asynchronously
 * on `camera.frame_processed` like any other staged media.
 */
export const snapshotHandler = async (
  request: Request,
  context: CoreContext,
): Promise<Response> => {
  const auth = authorize(request, context, 'USER')
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, snapshotBody)
  if (!parsed.ok) return parsed.response

  const source = context.config.source
  const camera = parsed.data.camera.trim().toLowerCase()
  const known = context.catalog.cameras(source)

  // An empty catalog means it has not loaded yet, not that the camera is wrong.
  if (known.length > 0 && !known.some((entry) => entry.code === camera)) {
    return json({ error: 'unknown camera' }, { status: 404 })
  }

  const payload: CameraRequest = { source, camera }
  await context.producer.publish(mediaStreams.cameraRequest(source), payload)

  return json({ ok: true })
}

/** Asks the domain to fetch and transcode an event's clip. */
export const clipHandler = async (
  request: Request,
  context: CoreContext,
): Promise<Response> => {
  const auth = authorize(request, context, 'USER')
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, clipBody)
  if (!parsed.ok) return parsed.response

  try {
    const reply = await context.commandBus.send(
      'event.clip',
      { eventId: parsed.data.eventId },
      auth.device.recipientUuid,
    )

    if (!reply.ok) {
      return json({ error: reply.error ?? 'rejected' }, { status: 400 })
    }
  } catch (error) {
    context.logger.warn('event.clip did not answer', error)
    return json({ error: 'unavailable' }, { status: 503 })
  }

  return json({ ok: true })
}

/** The NVR's camera list, as the adapter last published it. */
export const camerasHandler = (
  request: Request,
  context: CoreContext,
): Response => {
  const auth = authorize(request, context)
  if (!auth.ok) return auth.response

  return json({ cameras: context.catalog.cameras(context.config.source) })
}

/** Liveness and versions of every service, from the heartbeat stream. */
export const statusHandler = (
  request: Request,
  context: CoreContext,
): Response => {
  const auth = authorize(request, context)
  if (!auth.ok) return auth.response

  return json({ services: context.heartbeats.all() })
}
