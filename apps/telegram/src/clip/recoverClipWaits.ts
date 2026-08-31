import type { Stenograph } from 'stenograph'
import type { TelegramDatabase } from '../db/client'
import { clipWaitsRepo } from '../db/repository'
import type { ClipOutcome } from './ClipTracker'

/**
 * Turns waits left over from a previous life into a retry button.
 *
 * The clip request itself survives in Redis, but the in-memory wait does not:
 * without this the message keeps a disabled "⏳" button that can never be
 * tapped again, even once the clip arrives.
 */
export const recoverClipWaits = async (
  db: TelegramDatabase,
  logger: Stenograph,
  render: (eventId: string, outcome: ClipOutcome) => unknown,
): Promise<void> => {
  const pending = clipWaitsRepo.list(db)
  if (pending.length === 0) return

  logger.info(`Releasing ${pending.length} clip wait(s) left by a restart`)

  for (const { eventId } of pending) {
    try {
      await render(eventId, {
        failed: 'Прервано перезапуском — попробуйте ещё раз',
      })
    } catch (error) {
      logger.warn(`Failed to release clip wait for ${eventId}`, error)
    }
  }

  clipWaitsRepo.clear(db)
}
