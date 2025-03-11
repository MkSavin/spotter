import path from 'node:path'
import Bun from 'bun'
import { defaultLogger } from 'stenograph'
import { dir } from '../fs/dir'
import { temp } from '../fs/temp'
import { processImage } from '../processing/processImage'
import { processVideo } from '../processing/processVideo'

const mediaPath = process.env.MEDIA_PUBLIC_PATH ?? ''

export type EventMediaPayload = {
  eventId: string
  clipUrl?: string
  snapshotUrl?: string
}

const logger = defaultLogger.sub('action', 'eventMedia')

export const eventMediaAction = async (
  payload: EventMediaPayload,
): Promise<void> => {
  const { eventId, clipUrl, snapshotUrl } = payload

  const publicDirectory =
    process.env.MEDIA_PUBLIC_PATH ?? path.resolve(process.cwd(), 'temp/depot')

  if (!clipUrl && !snapshotUrl) {
    return
  }

  console.log(payload)

  const tempDir = await temp(`event-media-${eventId}`)
  const destinationDir = await dir(path.resolve(publicDirectory, mediaPath))

  try {
    logger.debug('Temporary directory used:', tempDir.directory)

    const context = {
      logger,
      tempDirectory: tempDir.directory,
      destinationDirectory: destinationDir.directory,
    }

    const processed = await Promise.all([
      processVideo(clipUrl, context).then((path) => ({ type: 'clip', path })),
      processImage(snapshotUrl, context).then((path) => ({
        type: 'image',
        path,
      })),
    ]) // 1741699565.062376-kyfpc4

    const media = processed.filter((entry) => !!entry.path)
    console.log(media)
  } finally {
    await tempDir.remove()
  }
}
