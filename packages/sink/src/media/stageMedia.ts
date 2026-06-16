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
 * Fetches a media artifact from the NVR (using the adapter-supplied request,
 * which carries any auth) and writes the raw bytes into S3 under `key`.
 *
 * Returns `true` on success, `false` when the artifact is missing or empty —
 * the credential never leaves this process, only the resulting S3 key does.
 */
export const stageMedia = async (
  s3: S3Client,
  key: string,
  fetchRequest: MediaFetch,
  contentType: string,
  logger: Stenograph,
): Promise<boolean> => {
  const response = await fetch(fetchRequest, { method: 'GET' })

  if (!response.ok) {
    logger.debug(`Media not available (status ${response.status}) for ${key}`)
    return false
  }

  const buffer = await response.arrayBuffer()

  if (buffer.byteLength === 0) {
    logger.debug(`Media body empty for ${key}`)
    return false
  }

  await s3.file(key).write(buffer, { type: contentType })

  logger.debug(`Staged raw media to s3://${key} (${buffer.byteLength} bytes)`)

  return true
}
