import {
  bufferToJson,
  type MediaStage,
  mediaStreams,
  type StreamMessageController,
  safeParseMediaRequest,
} from '@spotter/transport'
import type { SinkConfig } from '../config/sinkConfig'
import type { SinkContext } from '../runtime/context'
import type { MediaProvider } from './MediaProvider'
import { stagedClipKey, stagedSnapshotKey, stageMedia } from './stageMedia'

/**
 * Handles `spotter.media.request.<source>`: resolves the requested clip/snapshot
 * through the adapter's MediaProvider, stages the raw bytes into S3 and emits a
 * `MediaStaged` pointing at the keys. No URLs/credentials cross the wire.
 */
export const createMediaController = <TConfig extends SinkConfig>(
  provider: MediaProvider,
): StreamMessageController<SinkContext<TConfig>> => {
  return async (payload, context) => {
    const { topic, message } = payload
    const { producer, s3, sourceId, config, logger: baseLogger } = context

    const value = bufferToJson(message.value)
    const request = value && safeParseMediaRequest(value)

    if (!request || request.source !== sourceId) {
      return
    }

    if (!s3 || !config.s3) {
      baseLogger.warn('Media request received but S3 staging is not configured')
      return
    }

    const logger = baseLogger.sub('media', topic, request.eventId)
    const prefix = config.s3.stagingPrefix

    const report = (stage: MediaStage, reason?: string): Promise<unknown> =>
      producer
        .publish(mediaStreams.mediaProgress, {
          eventId: request.eventId,
          stage,
          ...(reason ? { reason } : {}),
        })
        .catch(() => undefined)

    await report('fetching')

    let rawClipKey: string | undefined
    let rawSnapshotKey: string | undefined

    if (request.want.includes('clip')) {
      const fetchRequest = await provider.resolveClip(request.eventId)
      if (fetchRequest) {
        const key = stagedClipKey(prefix, sourceId, request.eventId)
        if (await stageMedia(s3, key, fetchRequest, 'video/mp4', logger)) {
          rawClipKey = key
        }
      }
    }

    if (request.want.includes('snapshot')) {
      const fetchRequest = await provider.resolveSnapshot(request.eventId)
      if (fetchRequest) {
        const key = stagedSnapshotKey(prefix, sourceId, request.eventId)
        if (await stageMedia(s3, key, fetchRequest, 'image/jpeg', logger)) {
          rawSnapshotKey = key
        }
      }
    }

    // Silence would leave the bot's "processing" button stuck forever.
    if (!rawClipKey && !rawSnapshotKey) {
      logger.warn('Nothing staged for media request')
      // Usually not final: the NVR finishes writing a clip seconds after the
      // event ends, so a retry a little later often succeeds.
      await report('failed', 'Видео ещё не готово — попробуй через полминуты')
      await producer.publish(mediaStreams.mediaProcessed, {
        eventId: request.eventId,
      })
      return
    }

    // Clips go to their own stream so a slow transcode cannot starve snapshots.
    // A request carries one kind in practice (snapshot eagerly, clip on demand),
    // but a mixed one is split so neither kind waits on the other.
    const staged: Array<[string, Record<string, unknown>]> = []

    if (rawSnapshotKey) {
      staged.push([
        mediaStreams.mediaStaged,
        { eventId: request.eventId, source: sourceId, rawSnapshotKey },
      ])
    }

    if (rawClipKey) {
      staged.push([
        mediaStreams.mediaStagedClip,
        { eventId: request.eventId, source: sourceId, rawClipKey },
      ])
    }

    for (const [stream, payload] of staged) {
      await producer.publish(stream, payload)
      logger.info(`Staged media published to "${stream}"`)
    }

    await report('staged')
  }
}
