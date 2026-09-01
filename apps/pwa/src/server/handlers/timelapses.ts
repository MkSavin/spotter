import { timelapseStreams } from '@spotter/transport'
import type { CoreContext } from '../../context'
import { timelapsesRepo } from '../../db/repository'
import { authorize } from '../auth'
import { json, parseBody } from '../http'
import { timelapseBody } from '../schemas'

/** Everything this instance knows about, newest first. */
export const timelapsesHandler = (
  request: Request,
  context: CoreContext,
): Response => {
  const auth = authorize(request, context)
  if (!auth.ok) return auth.response

  const rows = timelapsesRepo.list(context.db)

  return json({
    timelapses: rows.map((row) => ({
      id: row.id,
      camera: row.camera,
      start: row.start,
      end: row.end,
      speed: row.speed,
      state: row.state,
      reason: row.reason,
      // Presigned on read, not stored: the URL expires and the key does not.
      videoUrl: row.videoKey
        ? context.s3.presign(row.videoKey, {
            expiresIn: context.config.presignExpiry,
          })
        : undefined,
      createdAt: row.createdAt.getTime(),
    })),
  })
}

/**
 * Starts an export. Returns as soon as the request is on the bus: the video
 * takes minutes, and the client watches the list for it.
 */
export const startTimelapseHandler = async (
  request: Request,
  context: CoreContext,
): Promise<Response> => {
  const auth = authorize(request, context, 'USER')
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, timelapseBody)
  if (!parsed.ok) return parsed.response

  const { camera, start, end, speed } = parsed.data

  if (end <= start) {
    return json({ error: 'empty period' }, { status: 400 })
  }

  const source = context.config.source
  const known = context.catalog.cameras(source)

  // An empty catalog means it has not loaded, not that the camera is wrong.
  if (known.length > 0 && !known.some((entry) => entry.code === camera)) {
    return json({ error: 'unknown camera' }, { status: 404 })
  }

  timelapsesRepo.start(context.db, {
    camera,
    start,
    end,
    speed,
    requestedBy: auth.device.recipientUuid,
  })

  await context.producer.publish(timelapseStreams.request(source), {
    source,
    camera,
    start,
    end,
    speed,
  })

  return json({ ok: true })
}
