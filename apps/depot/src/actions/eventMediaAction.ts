import type { CoreContext } from '../context'
import type { ProcessFileContext } from '../processing/processFile'
import { processImage } from '../processing/processImage'
import { processVideo } from '../processing/processVideo'

export type EventMediaPayload = {
  eventId: string
  eventCode: string
  clipUrl?: string
  snapshotUrl?: string
  endpointAuthorization?: string
}

type EventMediaResult = {
  eventId: string
  clipUrl?: string
  snapshotUrl?: string
}

export const eventMediaAction = async (
  payload: EventMediaPayload,
  context: CoreContext,
): Promise<EventMediaResult | undefined> => {
  const { eventId, eventCode, clipUrl, snapshotUrl } = payload

  try {
    context.logger.info('Starting to perform event media conversion')

    const processingContext: ProcessFileContext = {
      ...context,
      ...payload,
      bucket: 'event-media',
      filePrefix: `event-${eventCode}`,
    }

    context.logger.verbose('Action contents:', payload)

    const media = (
      await Promise.all([
        processVideo(clipUrl, processingContext)
          .catch((error) => {
            context.logger.error(error)
            return undefined
          })
          .then((url) => ({ type: 'video', url })),
        processImage(snapshotUrl, processingContext)
          .catch((error) => {
            context.logger.error(error)
            return undefined
          })
          .then((url) => ({ type: 'image', url })),
      ])
    ).filter((entry) => !!entry.url)

    if (media.length === 0) {
      context.logger.warn('No media returned in result of conversion')
      return undefined
    }

    context.logger.info(
      `Media successfully converted: ${media.map((entry) => entry.type).join(', ')}`,
    )

    const clip = media.find((entry) => entry.type === 'video')
    const snapshot = media.find((entry) => entry.type === 'image')

    return {
      eventId,
      clipUrl: clip?.url,
      snapshotUrl: snapshot?.url,
    }
  } catch (error) {
    context.logger.error(error)
  }

  return undefined
}
