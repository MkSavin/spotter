import type { Bot } from 'grammy'
import type { BotApi, BotContext } from '../context'
import {
  CLIP_WAIT,
  clipCallbackPattern,
  videoProcessingKeyboard,
} from '../transport/view/eventKeyboard'

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
        reply_markup: videoProcessingKeyboard(),
      })
    } catch (error) {
      context.logger.debug('Failed to set processing keyboard', error)
    }

    try {
      const reply = await context.commandBus.send(
        'event.clip',
        { eventId },
        context.session.user.recipientUuid,
      )
      if (!reply.ok) {
        context.logger
          .sub('clip')
          .warn(`event.clip rejected for ${eventId}: ${reply.error}`)
      }
    } catch (error) {
      context.logger.sub('clip').error('event.clip command failed', error)
    }
  })
}
