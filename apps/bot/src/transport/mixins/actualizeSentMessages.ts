import type { TransportContext } from '../../context'
import { diffAffectedChats } from '../helpers/diffAffectedChats'
import type { EventMessage } from '.prisma/client'

export const actualizeSentMessages = async (
  id: string,
  messages: EventMessage[],
  contents: string,
  context: TransportContext,
) => {
  const { bot, prisma, logger } = context

  const actualChats = await prisma.chat.findMany({
    select: {
      id: true,
    },
  })

  const { added, intersected } = diffAffectedChats(actualChats, messages)

  const options = { parse_mode: 'HTML' as const }

  try {
    const affected = await Promise.all([
      ...added.map(
        (chat): Promise<EventMessage> =>
          bot.api.sendMessage(chat.id, contents, options).then((message) => ({
            chatId: chat.id,
            id: message.message_id,
          })),
      ),
      ...intersected.map(
        (message): Promise<EventMessage> =>
          bot.api
            .editMessageText(message.chatId, message.id, contents, options)
            .then(() => message),
      ),
    ])

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
