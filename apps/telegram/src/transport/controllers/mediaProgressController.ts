import {
  bufferToJson,
  type StreamMessageController,
  safeParseMediaProgress,
} from '@spotter/transport'
import type { TransportContext } from '../../context'

/**
 * Consumes `spotter.media.progress`: moves the clip button through its stages
 * so a waiting user sees the pipeline working rather than a frozen spinner.
 */
export const mediaProgressController: StreamMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const value = bufferToJson(payload.message.value)
  if (!value) return

  const progress = safeParseMediaProgress(value)
  if (!progress) return

  if (progress.stage === 'failed') {
    context.clips.fail(
      progress.eventId,
      progress.reason ?? 'Не удалось получить видео',
    )
    return
  }

  context.clips.advance(progress.eventId, progress.stage)
}
