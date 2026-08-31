import type { S3Client } from 'bun'
import type { Stenograph } from 'stenograph'
import type { MediaFetch } from './MediaProvider'

/** Build the staging S3 key for an event's clip. */
export const stagedClipKey = (
  prefix: string,
  source: string,
  eventId: string,
): string => `${prefix}/${source}/event-${eventId}-clip.mp4`

/** Build the staging S3 key for an event's snapshot. */
export const stagedSnapshotKey = (
  prefix: string,
  source: string,
  eventId: string,
): string => `${prefix}/${source}/event-${eventId}-snapshot.jpg`

/** Build the staging S3 key for a camera's latest frame. */
export const stagedFrameKey = (
  prefix: string,
  source: string,
  camera: string,
): string => `${prefix}/${source}/camera-${camera}-frame.jpg`

/**
 * Why a staging attempt did not produce bytes.
 *
 * `absent` — the NVR says the artifact does not exist; retrying cannot help.
 * `unavailable` — a transient condition (5xx, network, empty body).
 */
export type StageFailure = 'absent' | 'unavailable'

export type StageResult =
  | { staged: true }
  | { staged: false; reason: StageFailure }

/**
 * Fetches a media artifact from the NVR (using the adapter-supplied request,
 * which carries any auth) and writes the raw bytes into S3 under `key`. The
 * credential never leaves this process, only the resulting S3 key does.
 */
export const stageMedia = async (
  s3: S3Client,
  key: string,
  fetchRequest: MediaFetch,
  contentType: string,
  logger: Stenograph,
): Promise<StageResult> => {
  let response: Response

  try {
    response = await fetch(fetchRequest, { method: 'GET' })
  } catch (error) {
    logger.warn(`Media fetch failed for ${key}: ${(error as Error)?.message}`)
    return { staged: false, reason: 'unavailable' }
  }

  if (!response.ok) {
    // 404 is a verdict: a short event never got a snapshot written, so every
    // retry burns a worker on the same answer.
    const reason: StageFailure =
      response.status === 404 ? 'absent' : 'unavailable'

    // Warn, not debug: this is why a requested clip never arrives.
    logger.warn(`Media not available (status ${response.status}) for ${key}`)
    return { staged: false, reason }
  }

  const buffer = await response.arrayBuffer()

  if (buffer.byteLength === 0) {
    logger.debug(`Media body empty for ${key}`)
    return { staged: false, reason: 'unavailable' }
  }

  await s3.file(key).write(buffer, { type: contentType })

  logger.debug(`Staged raw media to s3://${key} (${buffer.byteLength} bytes)`)

  return { staged: true }
}
