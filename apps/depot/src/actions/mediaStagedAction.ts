import {
  eventCode,
  type MediaProcessed,
  type MediaStaged,
  mediaStreams,
} from '@spotter/transport'
import type { CoreContext } from '../context'
import { processStaged } from '../processing/processStaged'
import { settle, TransientError } from '../processing/TransientError'

/**
 * Transcodes the raw event media staged in S3 (by key) and returns the
 * processed S3 keys. The depot never sees NVR URLs or credentials.
 */
export const mediaStagedAction = async (
  payload: MediaStaged,
  context: CoreContext,
): Promise<MediaProcessed | undefined> => {
  const { eventId, rawClipKey, rawSnapshotKey } = payload

  context.logger.info('Starting to perform staged event media conversion')

  const processingContext = {
    ...context,
    processedPath: 'event-media',
    filePrefix: `event-${eventCode(eventId)}`,
  }

  // Progress is a nicety: a broken publish must not fail the transcode.
  const reportProgress = (percent: number): void => {
    void context.producer
      .publish(mediaStreams.mediaProgress, {
        eventId,
        stage: 'staged',
        percent,
      })
      .catch(() => undefined)
  }

  // A permanent failure of one kind still lets the other be delivered; a
  // transient one is rethrown below so the entry stays pending for a retry.
  const [clip, snapshot] = await Promise.all([
    settle(() =>
      processStaged('video', rawClipKey, processingContext, reportProgress),
    ),
    settle(() => processStaged('image', rawSnapshotKey, processingContext)),
  ])

  const retryable = [clip, snapshot].find(
    (outcome) => outcome.error instanceof TransientError,
  )
  if (retryable) {
    throw retryable.error
  }

  for (const { error } of [clip, snapshot]) {
    if (error) context.logger.error(error)
  }

  const clipKey = clip.value
  const snapshotKey = snapshot.value

  if (!clipKey && !snapshotKey) {
    context.logger.warn('No media returned in result of conversion')
    return undefined
  }

  context.logger.info(
    `Media successfully converted: ${[clipKey && 'clip', snapshotKey && 'snapshot'].filter(Boolean).join(', ')}`,
  )

  return { eventId, clipKey, snapshotKey }
}
