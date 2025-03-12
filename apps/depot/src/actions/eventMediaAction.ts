import path from 'node:path'
import { dir } from '../fs/dir'
import { temp } from '../fs/temp'
import { env } from '../helpers/env'
import { depotLogger } from '../log'
import { processImage } from '../processing/processImage'
import { processVideo } from '../processing/processVideo'

const mediaPath = env.string(
  'MEDIA_PUBLIC_PATH',
  path.resolve(process.cwd(), 'temp/spotter-depot'),
)

export type EventMediaPayload = {
  eventId: string
  clipUrl?: string
  snapshotUrl?: string
  endpointAuthorization?: string
}

const actionLogger = depotLogger.sub('action', 'eventMedia')

export const eventMediaAction = async (
  payload: EventMediaPayload,
): Promise<void> => {
  const { eventId, clipUrl, snapshotUrl } = payload

  const logger = actionLogger.sub(eventId)

  if (!clipUrl && !snapshotUrl) {
    return
  }

  const code = eventId.split('-').at(1)

  const tempDir = await temp(`spotter-depot-media-${code}-`)
  const destinationDir = await dir(mediaPath)

  try {
    logger.info('Starting to perform event media conversion')

    const context = {
      logger,
      tempDirectory: tempDir.directory,
      destinationDirectory: destinationDir.directory,
      filePrefix: code ?? eventId,
      endpointAuthorization: payload.endpointAuthorization,
    }

    logger.verbose('Action contents:', payload)

    logger.verbose('Action context:', {
      tempDirectory: tempDir.directory,
      destinationDirectory: destinationDir.directory,
    })

    const processed = await Promise.all([
      processVideo(clipUrl, context)
        .catch((error) => {
          logger.error(error)
          return undefined
        })
        .then((path) => ({ type: 'clip', path })),
      processImage(snapshotUrl, context)
        .catch((error) => {
          logger.error(error)
          return undefined
        })
        .then((path) => ({
          type: 'image',
          path,
        })),
    ])

    const media = processed.filter((entry) => !!entry.path)

    const mediaTypes = media.map((entry) => entry.type)

    logger.info(`Media successfully converted: ${mediaTypes.join(', ')}`)
    console.log(media)
  } catch (error) {
    logger.error(error)
  } finally {
    await tempDir.remove()
  }
}
