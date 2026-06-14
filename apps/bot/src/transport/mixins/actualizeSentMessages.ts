import type { TransportContext } from '../../context'
import { eventsRepo } from '../../db/repository'
import type { EventMessage } from '../../db/schema'
import { supplySubscribers } from '../helpers/supplySubscribers'

export const actualizeSentMessages = async (
  id: string,
  messages: EventMessage[],
  contents: string,
  context: TransportContext,
) => {
  const { bot, db, logger } = context

  const options = { parse_mode: 'HTML' as const }

  try {
    const supplied = await supplySubscribers(messages, context, {
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

    eventsRepo.setMessages(db, id, affected)
  } catch (error) {
    logger.error('Error when processing messages', error)
  }
}
