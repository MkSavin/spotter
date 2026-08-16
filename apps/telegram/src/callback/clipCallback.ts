import type { Bot } from 'grammy'
import type { BotApi, BotContext } from '../context'
import {
  CLIP_WAIT,
  clipCallbackPattern,
  videoProcessingKeyboard,
} from '../transport/view/eventKeyboard'

/** Server error codes, in words the user can act on. */
const CLIP_ERRORS: Record<string, string> = {
  'not-found': 'Событие не найдено',
  'no-clip': 'У события нет видео',
}

/**
 * Registers the "Видео" inline-button handler. Tapping it requests an on-demand
 * clip transcode (event.clip RPC); the transcoded video flows back through the
 * normal media → delivery path and is edited onto every subscriber's message.
 *
 * Any member of an already-authorized chat may request the clip — the button
 * only exists on event messages delivered to authorized chats.
 */
export const registerClipCallback = (bot: Bot<BotContext, BotApi>): void => {
  bot.callbackQuery(clipCallbackPattern, async (context) => {
    const eventId = context.match?.[1]
    if (!eventId) return

    // The disabled "processing" button re-uses the clip prefix; just acknowledge.
    if (eventId === CLIP_WAIT) {
      await context.answerCallbackQuery({ text: 'Видео уже обрабатывается…' })
      return
    }

    await context.answerCallbackQuery({ text: 'Запрашиваю видео…' })

    try {
      // Swap to the disabled state immediately to prevent duplicate requests.
      await context.editMessageReplyMarkup({
        reply_markup: videoProcessingKeyboard('requested'),
      })
    } catch (error) {
      context.logger.debug('Failed to set processing keyboard', error)
    }

    const logger = context.logger.sub('clip')

    // Start the clock before the RPC: stage updates may arrive while it is
    // still in flight, and an unknown clip would be ignored by the tracker.
    context.clips.begin(eventId)

    try {
      const reply = await context.commandBus.send(
        'event.clip',
        { eventId },
        context.session.user.recipientUuid,
      )
      // A rejected request used to be logged and nothing else: the user kept
      // staring at "processing" for a clip that was never going to come.
      if (!reply.ok) {
        logger.warn(`event.clip rejected for ${eventId}: ${reply.error}`)
        context.clips.fail(
          eventId,
          CLIP_ERRORS[reply.error ?? ''] ?? 'Запрос отклонён',
        )
      }
    } catch (error) {
      logger.error('event.clip command failed', error)
      context.clips.fail(eventId, 'Сервис не ответил')
    }
  })
}
