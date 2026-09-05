import { parsedController, safeParseMediaProgress } from '@spotter/transport'
import type { TransportContext } from '../../context'

/** Consumes `spotter.media.progress`: moves the clip button through its stages. */
export const mediaProgressController = parsedController(
  safeParseMediaProgress,
  async (progress, context: TransportContext) => {
    if (progress.stage === 'failed') {
      context.clips.fail(
        progress.eventId,
        progress.reason ?? 'Не удалось получить видео',
      )
      return
    }

    context.clips.advance(progress.eventId, progress.stage, progress.percent)
  },
)
