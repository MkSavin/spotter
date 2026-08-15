import {
  eventCode,
  type MediaProcessed,
  type MediaStaged,
} from '@spotter/transport'
import type { CoreContext } from '../context'
import { processStaged } from '../processing/processStaged'

/**
 * Transcodes the raw event media staged in S3 (by key) and returns the
 * processed S3 keys. The depot never sees NVR URLs or credentials.
 */
export const mediaStagedAction = async (
  payload: MediaStaged,
  context: CoreContext,
): Promise<MediaProcessed | undefined> => {
  const { eventId, rawClipKey, rawSnapshotKey } = payload

  try {
    context.logger.info('Starting to perform staged event media conversion')

    const processingContext = {
      ...context,
      processedPath: 'event-media',
      filePrefix: `event-${eventCode(eventId)}`,
    }

    const [clipKey, snapshotKey] = await Promise.all([
      processStaged('video', rawClipKey, processingContext).catch((error) => {
        context.logger.error(error)
        return undefined
      }),
      processStaged('image', rawSnapshotKey, processingContext).catch(
        (error) => {
          context.logger.error(error)
          return undefined
        },
      ),
    ])

    if (!clipKey && !snapshotKey) {
      context.logger.warn('No media returned in result of conversion')
      return undefined
    }

    context.logger.info(
      `Media successfully converted: ${[clipKey && 'clip', snapshotKey && 'snapshot'].filter(Boolean).join(', ')}`,
    )

    return { eventId, clipKey, snapshotKey }
  } catch (error) {
    context.logger.error(error)
  }

  return undefined
}
