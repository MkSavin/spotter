import Bun from 'bun'
import ffmpeg from 'fluent-ffmpeg'
import { type Stenograph, defaultLogger } from 'stenograph'

export type ProcessVideoContext = {
  logger?: Stenograph
  tempDirectory: string
  destinationDirectory: string
}

export const processVideo = async (
  url: string | undefined,
  context: ProcessVideoContext,
): Promise<string | undefined> => {
  if (!url) {
    return undefined
  }

  const {
    logger: baseLogger = defaultLogger,
    tempDirectory,
    destinationDirectory,
  } = context

  const logger = baseLogger.sub('processing', 'video')

  const response = await fetch(url, {
    method: 'GET',
  })

  const hash = Bun.hash(url)

  const raw = Bun.file(`${tempDirectory}/${hash}-raw.mp4`)
  const processed = Bun.file(`${destinationDirectory}/${hash}-processed.mp4`)

  logger.debug('Starting file processing...', {
    raw,
    processed,
  })

  await Bun.write(raw, await response.arrayBuffer(), {
    createPath: true,
  })

  await new Promise<void>((resolve, reject) => {
    if (!raw?.name || !processed?.name) {
      reject(new Error('Clip files is not assigned correctly'))
      return
    }

    ffmpeg(raw.name)
      .addOptions(['-preset', 'superfast'])
      .videoCodec('libx264')
      .size('1920x1080')
      .noAudio()
      .format('mp4')
      .fps(24)
      .on('error', reject)
      .on('progress', (progress) => {
        logger.debug(
          `Progress: ${progress.percent}% / 100% (${progress.frames})`,
        )
      })
      .on('end', () => resolve())
      .save(processed.name)
  })

  logger.debug('Video file successfully processed!', {
    processed,
  })

  return processed.name
}
