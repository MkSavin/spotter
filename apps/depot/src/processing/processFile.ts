import Bun, { type BunFile } from 'bun'
import { type Stenograph, defaultLogger } from 'stenograph'
import { mime, type mimeExtensions } from '../fs/extension'

type NamedBunFile = Omit<BunFile, 'name'> & {
  /**
   * The name or path of the file, as specified in the constructor.
   */
  readonly name: string
}

export type ProcessFileContext = {
  logger?: Stenograph
  filePrefix: string
  tempDirectory: string
  destinationDirectory: string
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
    logger: baseLogger = defaultLogger,
    filePrefix,
    tempDirectory,
    destinationDirectory,
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
    `${tempDirectory}/${filePrefix}-${hash}-raw.${extension}`,
  )
  const processed = Bun.file(
    `${destinationDirectory}/${filePrefix}-${hash}-processed.${extension}`,
  )

  logger.debug(`Processing ${mimeType}...`)
  logger.verbose('Directory structure:', {
    raw: raw.name,
    processed: processed.name,
  })

  await Bun.write(raw, await response.arrayBuffer(), {
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

  return processed.name
}
