import path from 'node:path'
import type { CoreContext } from '../context'
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
  clipPath?: string
  snapshotPath?: string
}

export const eventMediaAction = async (
  payload: EventMediaPayload,
  context: CoreContext,
): Promise<EventMediaResult | undefined> => {
  const { eventId, eventCode, clipUrl, snapshotUrl } = payload

  try {
    context.logger.info('Starting to perform event media conversion')

    const processingContext = {
      ...context,
      ...payload,
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
          .then((path) => ({ type: 'video', path })),
        processImage(snapshotUrl, processingContext)
          .catch((error) => {
            context.logger.error(error)
            return undefined
          })
          .then((path) => ({ type: 'image', path })),
      ])
    ).filter((entry) => !!entry.path)

    if (media.length === 0) {
      context.logger.warn('No media returned in result of conversion')
      return undefined
    }

    context.logger.info(
      `Media successfully converted: ${media.map((entry) => entry.type).join(', ')}`,
    )

    const clip = media.find((entry) => entry.type === 'video')
    const snapshot = media.find((entry) => entry.type === 'image')

    const destination = context.directory.destination.directory

    return {
      eventId,
      clipPath: clip?.path ? path.relative(destination, clip.path) : undefined,
      snapshotPath: snapshot?.path
        ? path.relative(destination, snapshot.path)
        : undefined,
    }
  } catch (error) {
    context.logger.error(error)
  }

  return undefined
}
