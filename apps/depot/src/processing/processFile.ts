import path from 'node:path'
import Bun, { type BunFile } from 'bun'
import { type Stenograph, defaultLogger } from 'stenograph'
import type { CoreContext } from '../context'
import { mime, type mimeExtensions } from '../fs/mime'

type NamedBunFile = Omit<BunFile, 'name'> & {
  /**
   * The name or path of the file, as specified in the constructor.
   */
  readonly name: string
}

export type ProcessFileContext = CoreContext & {
  s3Path?: string
  filePrefix: string
  endpointAuthorization?: string
}

type ProcessFilePropagatedContext = Omit<ProcessFileContext, 'logger'> & {
  logger: Stenograph
}

type ProcessFilePayload = {
  raw: NamedBunFile
  processed: NamedBunFile

  context: ProcessFilePropagatedContext
}

export const processFile = async (
  mimeType: keyof typeof mimeExtensions,
  url: string | undefined,
  context: ProcessFileContext,

  callback: (payload: ProcessFilePayload) => Promise<void>,
): Promise<string | undefined> => {
  if (!url) {
    return undefined
  }

  const {
    s3,
    logger: baseLogger = defaultLogger,
    s3Path,
    filePrefix,
    directory,
    endpointAuthorization,
  } = context

  const mimeHelper = mime(mimeType)

  const logger = baseLogger.sub('processing', mimeType)

  const response = await fetch(url, {
    method: 'GET',
    headers: endpointAuthorization
      ? {
          Authorization: endpointAuthorization,
        }
      : undefined,
  })

  if (!response.ok) {
    throw new Error(
      `Got error status while trying to get file contents: ${response.status}`,
    )
  }

  const hash = Bun.hash(url)

  const extension = mimeHelper.type === 'image' ? 'jpg' : 'mp4'

  const raw = Bun.file(
    `${directory.temp.directory}/${filePrefix}-${hash}-raw.${extension}`,
  )
  const processed = Bun.file(
    `${directory.temp.directory}/${filePrefix}-${hash}-processed.${extension}`,
  )

  const objectFile = path.join(
    s3Path ?? '',
    `${filePrefix}-${hash}.${extension}`,
  )

  logger.debug(`Processing ${mimeType}...`)
  logger.verbose('Directory structure:', {
    raw: raw.name,
    processed: processed.name,
  })

  const arrayBuffer = await response.arrayBuffer()

  if (arrayBuffer.byteLength === 0) {
    throw new Error('File buffer is empty, skipping...')
  }

  await Bun.write(raw, arrayBuffer, {
    createPath: true,
  })

  if (!raw?.name || !processed?.name) {
    throw new Error('Image files is not assigned correctly')
  }

  await callback({
    raw: raw as NamedBunFile,
    processed: processed as NamedBunFile,
    context: {
      ...context,
      logger,
    },
  })

  logger.debug('File successfully processed:', {
    mime: mimeType,
    processed: processed.name,
  })

  const file = s3.file(objectFile)

  await file.write(processed, {
    type: mimeType,
  })

  logger.debug('File successfully uploaded to s3')

  if (context.config.directory.cleanupStrategy === 'file-processed') {
    await Promise.all([raw.delete(), processed.delete()])
  }

  return file.presign({
    acl: 'public-read',
    expiresIn: 60 * 60 * 24, // 1 day
  })
}
