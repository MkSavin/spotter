import type { InlineKeyboard } from 'grammy'
import type { TransportContext } from '../../context'
import { eventMessagesRepo } from '../../db/repository'
import type { EventMessage } from '../../db/schema'
import { supplySubscribers } from '../helpers/supplySubscribers'

export const actualizeSentMessages = async (
  eventId: string,
  messages: EventMessage[],
  contents: string,
  context: TransportContext,
  keyboard?: InlineKeyboard,
) => {
  const { bot, db, logger } = context

  const options = {
    parse_mode: 'HTML' as const,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  }

  const { supplied, failed } = await supplySubscribers(messages, context, {
    create: (chatId) =>
      bot.api
        .sendMessage(chatId, contents, options)
        .then((message) => ({ id: message.message_id, chatId })),
    update: async (message) =>
      bot.api
        .editMessageText(message.chatId, message.id, contents, options)
        .then(() => message),
  })

  const affected = supplied
    .map((entry) => entry.data)
    .filter((entry): entry is EventMessage => Boolean(entry))

  // Persist what did land before propagating: on retry these chats are seen as
  // already-supplied and skipped, so only the failed ones are re-attempted.
  eventMessagesRepo.set(db, eventId, affected)

  if (failed) {
    logger.warn(`Some chats failed for ${eventId}; leaving pending for retry`)
    throw new Error(`delivery incomplete for event ${eventId}`)
  }
}
