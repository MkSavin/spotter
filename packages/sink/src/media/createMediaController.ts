import {
  bufferToJson,
  type MediaStage,
  type MediaWant,
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

    // Every requested kind the NVR answered "does not exist" for.
    const absent: MediaWant[] = []

    if (request.want.includes('clip')) {
      const fetchRequest = await provider.resolveClip(request.eventId)
      if (fetchRequest) {
        const key = stagedClipKey(prefix, sourceId, request.eventId)
        const result = await stageMedia(
          s3,
          key,
          fetchRequest,
          'video/mp4',
          logger,
        )
        if (result.staged) rawClipKey = key
        else if (result.reason === 'absent') absent.push('clip')
      }
    }

    if (request.want.includes('snapshot')) {
      const fetchRequest = await provider.resolveSnapshot(request.eventId)
      if (fetchRequest) {
        const key = stagedSnapshotKey(prefix, sourceId, request.eventId)
        const result = await stageMedia(
          s3,
          key,
          fetchRequest,
          'image/jpeg',
          logger,
        )
        if (result.staged) rawSnapshotKey = key
        else if (result.reason === 'absent') absent.push('snapshot')
      }

      // No snapshot of its own: cut a frame out of the recording instead, so a
      // sub-second event still gets a picture.
      if (!rawSnapshotKey && provider.resolveEventFrame) {
        const frameRequest = await provider.resolveEventFrame(request.eventId)
        if (frameRequest) {
          const key = stagedSnapshotKey(prefix, sourceId, request.eventId)
          const result = await stageMedia(
            s3,
            key,
            frameRequest,
            'image/jpeg',
            logger,
          )
          if (result.staged) {
            rawSnapshotKey = key
            // The recording covered it after all.
            const index = absent.indexOf('snapshot')
            if (index !== -1) absent.splice(index, 1)
            logger.debug(
              `Recovered snapshot from recording for ${request.eventId}`,
            )
          }
        }
      }
    }

    if (!rawClipKey && !rawSnapshotKey) {
      // The NVR has ruled out everything asked for: a sub-second event never
      // got a snapshot written. Report it as final so the entry is acked
      // instead of burning five deliveries on the same 404.
      if (absent.length === request.want.length) {
        await report('failed', 'У события нет снимка')
        await producer.publish(mediaStreams.mediaProcessed, {
          eventId: request.eventId,
        })
        logger.debug(`No media exists for ${request.eventId}; not retrying`)
        return
      }

      // Usually temporary: the NVR writes media just after the event ends and
      // rate-limits under a burst. Throw so the reaper retries instead of acking.
      await report('failed', 'Видео ещё не готово — попробуй через полминуты')
      throw new Error(`Nothing staged for media request ${request.eventId}`)
    }

    // Own stream per kind, so a slow transcode cannot starve snapshots.
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
