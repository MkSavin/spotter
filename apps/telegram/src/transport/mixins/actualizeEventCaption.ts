import type { InlineKeyboard } from 'grammy'
import type { TransportContext } from '../../context'
import { eventMessagesRepo } from '../../db/repository'
import type { EventMessage } from '../../db/schema'
import { supplySubscribers } from '../helpers/supplySubscribers'

/** A redelivery edits what is already there; Telegram calls that an error. */
const unchanged = (error: unknown): boolean =>
  /message is not modified/i.test((error as Error)?.message ?? '')

/**
 * Rewrites the caption and keyboard of an event's messages in place, through
 * the same fan-out as every other edit, so muted chats stay untouched and a
 * chat without a message gets one. The message may still be text when no
 * snapshot ever arrived, and Telegram edits text and captions with different
 * calls, so the second is tried after the first is refused.
 */
export const actualizeEventCaption = async (
  eventId: string,
  messages: EventMessage[],
  caption: string,
  keyboard: InlineKeyboard | undefined,
  context: TransportContext,
): Promise<void> => {
  const { bot, db, logger } = context
  const options = {
    parse_mode: 'HTML' as const,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  }

  const { supplied, failed } = await supplySubscribers(messages, context, {
    create: (chatId): Promise<EventMessage> =>
      bot.api
        .sendMessage(chatId, caption, options)
        .then((message) => ({ id: message.message_id, chatId })),
    update: async (message): Promise<EventMessage> => {
      try {
        await bot.api.editMessageCaption(message.chatId, message.id, {
          caption,
          ...options,
        })
      } catch (error) {
        if (unchanged(error)) return message
        try {
          await bot.api.editMessageText(
            message.chatId,
            message.id,
            caption,
            options,
          )
        } catch (inner) {
          if (!unchanged(inner)) throw inner
        }
      }
      return message
    },
  })

  const affected = supplied
    .map((entry) => entry.data)
    .filter((entry): entry is EventMessage => Boolean(entry))

  // Merged, never replaced: a wipe makes the retry re-send to served chats.
  eventMessagesRepo.record(db, eventId, affected)

  if (failed) {
    logger.warn(`Some chats failed for ${eventId}; leaving pending for retry`)
    throw new Error(`caption update incomplete for event ${eventId}`)
  }
}
