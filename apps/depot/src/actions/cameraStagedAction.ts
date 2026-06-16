import type { CameraProcessed, CameraStaged } from '@spotter/transport'
import type { CoreContext } from '../context'
import { processStaged } from '../processing/processStaged'

/**
 * Transcodes the raw camera frame staged in S3 (by key) and returns the
 * processed S3 key, preserving the correlation ids back to the frontend.
 */
export const cameraStagedAction = async (
  payload: CameraStaged,
  context: CoreContext,
): Promise<CameraProcessed | undefined> => {
  const { camera, rawFrameKey, chatId, messageId } = payload

  try {
    context.logger.info('Starting to perform staged camera frame conversion')

    const frameKey = await processStaged('image', rawFrameKey, {
      ...context,
      processedPath: 'camera-media',
      filePrefix: `camera-${camera}`,
    }).catch((error) => {
      context.logger.error(error)
      return undefined
    })

    if (!frameKey) {
      return undefined
    }

    context.logger.info('Media successfully converted: frame')

    return { camera, frameKey, chatId, messageId }
  } catch (error) {
    context.logger.error(error)
  }

  return undefined
}
