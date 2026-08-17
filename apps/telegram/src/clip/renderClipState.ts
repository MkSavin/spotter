import type { Api, RawApi } from 'grammy'
import type { Stenograph } from 'stenograph'
import type { TelegramDatabase } from '../db/client'
import { eventMessagesRepo } from '../db/repository'
import {
  videoProcessingKeyboard,
  videoRetryKeyboard,
} from '../transport/view/eventKeyboard'
import type { ClipOutcome } from './ClipTracker'

/** Repaints the clip button on every message of an event. */
export const renderClipState = async (
  api: Api<RawApi>,
  db: TelegramDatabase,
  logger: Stenograph,
  eventId: string,
  outcome: ClipOutcome,
): Promise<void> => {
  const markup =
    'failed' in outcome
      ? videoRetryKeyboard(eventId)
      : videoProcessingKeyboard(outcome.stage)

  const messages = eventMessagesRepo.find(db, eventId)

  const results = await Promise.allSettled(
    messages.map((message) =>
      api.editMessageReplyMarkup(message.chatId, message.id, {
        reply_markup: markup,
      }),
    ),
  )

  // Telegram rejects an identical markup; not worth an error.
  const failed = results.filter((result) => result.status === 'rejected')
  for (const result of failed)
    logger.debug(`Clip button repaint skipped: ${result.reason}`)

  if ('failed' in outcome) {
    logger.info(`Clip for ${eventId} ended: ${outcome.failed}`)
  }
}
