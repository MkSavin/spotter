import path from 'node:path'
import Bun, { type BunFile } from 'bun'
import type { CoreContext } from '../context'
import { TransientError, transient } from './TransientError'
import {
  type ProgressReporter,
  TranscodeError,
  transcodeImage,
  transcodeVideo,
} from './transcode'

export type StagedKind = 'video' | 'image'

export type ProcessStagedContext = CoreContext & {
  /** S3 prefix under which the transcoded result is stored. */
  processedPath: string
  filePrefix: string
}

const kinds = {
  video: {
    extension: 'mp4',
    contentType: 'video/mp4',
  },
  image: {
    extension: 'jpg',
    contentType: 'image/jpeg',
  },
} as const

/**
 * Staged-path processing: downloads raw bytes from S3 by key, transcodes them
 * and uploads the result back to S3 — returning the processed S3 *key* (not a
 * URL). No NVR URLs or credentials are involved; depot only ever sees S3.
 */
export const processStaged = async (
  kind: StagedKind,
  rawKey: string | undefined,
  context: ProcessStagedContext,
  onProgress?: ProgressReporter,
): Promise<string | undefined> => {
  if (!rawKey) {
    return undefined
  }

  const { s3, directory, filePrefix, processedPath, config } = context
  const { extension, contentType } = kinds[kind]

  const logger = context.logger.sub('staged', kind)

  const rawObject = s3.file(rawKey)

  // Staging and transcoding race: the object may not be visible yet, so a miss
  // is retryable rather than a verdict on the media.
  if (!(await transient('s3 head', () => rawObject.exists()))) {
    throw new TransientError(`Staged object not found in s3: ${rawKey}`)
  }

  const rawBuffer = await transient('s3 get', () => rawObject.arrayBuffer())

  // Also retryable: an empty read usually means the upload is still in flight.
  // If it really is a zero-byte object the DLQ bounds the retries.
  if (rawBuffer.byteLength === 0) {
    throw new TransientError(`Staged object is empty: ${rawKey}`)
  }

  const hash = Bun.hash(rawKey)

  const raw: BunFile = Bun.file(
    `${directory.temp.directory}/${filePrefix}-${hash}-raw.${extension}`,
  )
  const processed: BunFile = Bun.file(
    `${directory.temp.directory}/${filePrefix}-${hash}-processed.${extension}`,
  )

  await Bun.write(raw, rawBuffer, { createPath: true })

  logger.debug(`Processing staged ${kind} from ${rawKey}`)

  if (kind === 'video') {
    try {
      await transcodeVideo(raw, processed, config.video, logger, onProgress)
    } catch (error) {
      // A killed encode says the box was too slow or too busy, not that the
      // clip is bad — worth one more delivery.
      if (error instanceof TranscodeError && error.timedOut) {
        throw new TransientError(error.message, error)
      }
      throw error
    }
  } else {
    await transcodeImage(raw, processed, config.image, logger, onProgress)
  }

  const processedKey = path.join(
    processedPath,
    `${filePrefix}-${hash}.${extension}`,
  )

  await transient('s3 put', () =>
    s3.file(processedKey).write(processed, { type: contentType }),
  )

  logger.debug(`Uploaded processed ${kind} to s3://${processedKey}`)

  if (context.config.directory.cleanupStrategy === 'file-processed') {
    await Promise.all([raw.delete(), processed.delete()])
  }

  return processedKey
}
