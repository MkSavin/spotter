import type { CameraProcessed, CameraStaged } from '@spotter/transport'
import type { CoreContext } from '../context'
import { processStaged } from '../processing/processStaged'
import { settle, TransientError } from '../processing/TransientError'

/**
 * Transcodes the raw camera frame staged in S3 (by key) and returns the
 * processed S3 key, preserving the correlation ids back to the frontend.
 */
export const cameraStagedAction = async (
  payload: CameraStaged,
  context: CoreContext,
): Promise<CameraProcessed | undefined> => {
  const { camera, rawFrameKey, chatId, messageId } = payload

  context.logger.info('Starting to perform staged camera frame conversion')

  // Transient failures escape so the regulator retries; permanent ones are
  // logged and reported as a miss to the waiting frontend.
  const { value: frameKey, error } = await settle(() =>
    processStaged('image', rawFrameKey, {
      ...context,
      processedPath: 'camera-media',
      filePrefix: `camera-${camera}`,
    }),
  )

  if (error instanceof TransientError) {
    throw error
  }

  if (error) {
    context.logger.error(error)
  }

  if (!frameKey) {
    return undefined
  }

  context.logger.info('Media successfully converted: frame')

  return { camera, frameKey, chatId, messageId }
}
