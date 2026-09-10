import type { CoreContext } from '../../context'
import { recentEventsRepo } from '../../db/repository'
import type { FeedEntryStored } from '../../render/feedEntry'
import { authorize } from '../auth'
import { notFound } from '../http'

/** Which media of an event to serve. */
export type MediaKind = 'snapshot' | 'clip'

const contentType = (kind: MediaKind): string =>
  kind === 'clip' ? 'video/mp4' : 'image/jpeg'

/** Parses a `bytes=start-end` header; `null` when absent or unusable. */
export const parseRange = (
  header: string | null,
): { start: number; end?: number } | null => {
  if (!header) return null
  const match = /^bytes=(\d+)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : undefined
  if (end !== undefined && end < start) return null
  return { start, end }
}

/**
 * Proxied rather than presigned: a browser cannot use a presigned S3 URL.
 * See docs/foundings/http-and-push.md.
 */
export const mediaHandler = async (
  request: Request,
  eventId: string,
  kind: MediaKind,
  context: CoreContext,
): Promise<Response> => {
  /** Media tags cannot set a header, so this route also accepts `?token=`. */
  const auth = authorize(request, context, 'authorized', {
    allowQueryToken: true,
  })
  if (!auth.ok) return auth.response

  const row = recentEventsRepo.get(context.db, eventId)
  if (!row) return notFound('event not found')

  const stored = row.payload as FeedEntryStored
  const key = kind === 'clip' ? stored.clipKey : stored.snapshotKey
  if (!key) return notFound(`no ${kind} for this event`)

  const file = context.s3.file(key)

  try {
    /**
     * Range matters for video: without it the browser cannot seek, and Safari
     * refuses to play the clip at all.
     */
    const range = parseRange(request.headers.get('range'))

    if (range) {
      const { size } = await file.stat()
      const last = range.end ?? size - 1
      const slice = file.slice(range.start, last + 1)

      return new Response(slice.stream(), {
        status: 206,
        headers: {
          'content-type': contentType(kind),
          'content-range': `bytes ${range.start}-${last}/${size}`,
          'content-length': String(last - range.start + 1),
          'accept-ranges': 'bytes',
          'cache-control': 'private, max-age=3600',
        },
      })
    }

    return new Response(file.stream(), {
      headers: {
        'content-type': contentType(kind),
        'accept-ranges': 'bytes',
        'cache-control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    // A key can outlive its object: retention on the bucket, or a staged file
    // cleaned up. That is a missing file, not a broken server.
    context.logger.sub('media').warn(`Could not read ${kind} ${key}`, error)
    return notFound('media unavailable')
  }
}
