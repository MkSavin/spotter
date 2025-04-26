import type { TransportContext } from '../../context'
import { supplySubscribers } from '../helpers/supplySubscribers'
import type { EventMessage } from '.prisma/client'

export const actualizeSentMessages = async (
  id: string,
  messages: EventMessage[],
  contents: string,
  context: TransportContext,
) => {
  const { bot, prisma, logger } = context

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

    await prisma.event.update({
      where: {
        id,
      },

      data: {
        messages: affected,
      },
    })
  } catch (error) {
    logger.error('Error when processing messages', error)
  }
}
