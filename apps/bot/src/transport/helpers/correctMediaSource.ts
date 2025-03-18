import { InputFile } from 'grammy'
import type { TransportContext } from '../../context'

const localhostRegex =
  /^((?:http|https):\/\/)?(localhost|minio|127\.0\.0\.1|192\.168\.[0-9]{1,3}\.[0-9]{1,3}):?(\d+)?/gi

export const correctMediaSource = async (
  media: InputFile | string | null,
  context: TransportContext,
): Promise<InputFile | null> => {
  const { config, logger } = context

  if (!media || typeof media !== 'string') {
    return null
  }

  if (!media.match(localhostRegex) && config.media.strategy === 'link') {
    return null
  }

  const response = await fetch(media as string, {
    method: 'GET',
  })

  if (!response.ok) {
    logger.debug('Cannot modify event media. Response is not ok')
    return null
  }

  return new InputFile(new Uint8Array(await response.arrayBuffer()))
}
