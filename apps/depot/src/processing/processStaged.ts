import path from 'node:path'
import Bun, { type BunFile } from 'bun'
import type { CoreContext } from '../context'
import { transcodeImage, transcodeVideo } from './transcode'

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
    transcode: transcodeVideo,
  },
  image: {
    extension: 'jpg',
    contentType: 'image/jpeg',
    transcode: transcodeImage,
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
): Promise<string | undefined> => {
  if (!rawKey) {
    return undefined
  }

  const { s3, directory, filePrefix, processedPath } = context
  const { extension, contentType, transcode } = kinds[kind]

  const logger = context.logger.sub('staged', kind)

  const rawObject = s3.file(rawKey)

  if (!(await rawObject.exists())) {
    throw new Error(`Staged object not found in s3: ${rawKey}`)
  }

  const rawBuffer = await rawObject.arrayBuffer()

  if (rawBuffer.byteLength === 0) {
    throw new Error(`Staged object is empty: ${rawKey}`)
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

  await transcode(raw, processed, logger)

  const processedKey = path.join(
    processedPath,
    `${filePrefix}-${hash}.${extension}`,
  )

  await s3.file(processedKey).write(processed, { type: contentType })

  logger.debug(`Uploaded processed ${kind} to s3://${processedKey}`)

  if (context.config.directory.cleanupStrategy === 'file-processed') {
    await Promise.all([raw.delete(), processed.delete()])
  }

  return processedKey
}
