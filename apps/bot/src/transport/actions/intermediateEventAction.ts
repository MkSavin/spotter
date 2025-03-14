import type { SpotterEvent } from '@spotter/transport'
import type { TransportContext } from '../../context'
import { renderEvent } from '../view/renderEvent'
import type { EventMessage } from '.prisma/client'

export const intermediateEventAction = async (
  event: SpotterEvent,
  context: TransportContext,
): Promise<void> => {
  const { bot, logger, prisma } = context
  const { id, ...eventData } = event

  let storedEvent = await prisma.event.findUnique({
    where: {
      id,
    },
  })

  if (storedEvent?.type === 'end') {
    return
  }

  logger.debug(`Feeding ${event.type} event...`)

  storedEvent = await prisma.event.upsert({
    where: {
      id,
    },

    create: {
      ...event,
    },

    update: {
      ...eventData,
    },
  })

  const contents = renderEvent(storedEvent, context)

  const chats = await prisma.chat.findMany({
    select: {
      id: true,
    },
  })

  const options = { parse_mode: 'HTML' as const }

  const messages = await Promise.all(
    chats.map(
      (chat): Promise<EventMessage> =>
        bot.api.sendMessage(chat.id, contents, options).then((message) => ({
          id: message.message_id,
          chatId: chat.id,
        })),
    ),
  )

  await prisma.event.update({
    where: {
      id,
    },

    data: {
      messages,
    },
  })

  logger.debug(`Feeding ${event.type} event successfully finished`)
}
