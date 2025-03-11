import Bun from 'bun'
import sharp from 'sharp'
import { type Stenograph, defaultLogger } from 'stenograph'

export type ProcessImageContext = {
  logger?: Stenograph
  tempDirectory: string
  destinationDirectory: string
}

export const processImage = async (
  url: string | undefined,
  context: ProcessImageContext,
): Promise<string | undefined> => {
  if (!url) {
    return undefined
  }

  const {
    logger: baseLogger = defaultLogger,
    tempDirectory,
    destinationDirectory,
  } = context

  const logger = baseLogger.sub('processing', 'image')

  const response = await fetch(url, {
    method: 'GET',
  })

  const hash = Bun.hash(url)

  const raw = Bun.file(`${tempDirectory}/${hash}-raw.jpg`)
  const processed = Bun.file(`${destinationDirectory}/${hash}-processed.jpg`)

  logger.debug('Starting file processing...', {
    raw,
    processed,
  })

  await Bun.write(raw, await response.arrayBuffer(), {
    createPath: true,
  })

  if (!raw?.name || !processed?.name) {
    logger.error(new Error('Image files is not assigned correctly'))
    return
  }

  const output = await sharp(raw.name)
    // .resize({
    //   width: 720,
    // })
    .jpeg({
      quality: 80,
    })
    .toFile(processed.name)

  logger.debug('Image file successfully processed!', {
    format: output.format,
    size: output.size,
    width: output.width,
    height: output.height,
  })

  return processed.name
}
