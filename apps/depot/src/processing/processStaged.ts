import path from 'node:path'
import Bun, { type BunFile } from 'bun'
import type { CoreContext } from '../context'
import { MB, splitVideo } from './splitVideo'
import { TransientError, transient } from './TransientError'
import {
  type ProgressReporter,
  transcodeImage,
  transcodeVideo,
} from './transcode'

export type StagedKind = 'video' | 'image'

/** The processed object, plus its parts when a clip was over the part limit. */
export type ProcessedMedia = {
  key: string
  parts?: string[]
}

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
 * and uploads the result back to S3 — returning the processed S3 *keys* (not
 * URLs). No NVR URLs or credentials are involved; depot only ever sees S3.
 */
export const processStaged = async (
  kind: StagedKind,
  rawKey: string | undefined,
  context: ProcessStagedContext,
  onProgress?: ProgressReporter,
): Promise<ProcessedMedia | undefined> => {
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

  let partFiles: string[] = []

  try {
    if (kind === 'video') {
      await transcodeVideo(raw, processed, config.video, logger, onProgress)
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

    if (kind !== 'video') return { key: processedKey }

    partFiles = await cutParts(processed, context, logger)
    if (partFiles.length === 0) return { key: processedKey }

    const parts = await Promise.all(
      partFiles.map(async (file, index) => {
        const partKey = path.join(
          processedPath,
          `${filePrefix}-${hash}.part${index + 1}.${extension}`,
        )
        await transient('s3 put', () =>
          s3.file(partKey).write(Bun.file(file), { type: contentType }),
        )
        return partKey
      }),
    )

    logger.debug(`Uploaded ${parts.length} parts of ${processedKey}`)

    return { key: processedKey, parts }
  } finally {
    // Also on failure: a timed-out transcode is retried, and leaving both files
    // behind each time fills the disk the NVR records onto.
    if (context.config.directory.cleanupStrategy === 'file-processed') {
      await Promise.all(
        [raw, processed, ...partFiles.map((file) => Bun.file(file))].map(
          (file) => file.delete().catch(() => undefined),
        ),
      )
    }
  }
}

/** A failed cut still leaves the whole clip, which is worth delivering. */
const cutParts = async (
  processed: BunFile,
  context: ProcessStagedContext,
  logger: ProcessStagedContext['logger'],
): Promise<string[]> => {
  const { partLimitMb, timeoutMs } = context.config.video
  if (!processed.name) return []

  try {
    return await splitVideo(processed.name, partLimitMb * MB, timeoutMs, logger)
  } catch (error) {
    logger.warn('Could not cut the clip into parts', error)
    return []
  }
}
