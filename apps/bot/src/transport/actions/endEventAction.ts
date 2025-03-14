import type { SpotterEvent } from '@spotter/transport'
import type { TransportContext } from '../../context'
import { renderEvent } from '../view/renderEvent'
import type { EventMessage } from '.prisma/client'
import { diffAffectedChats } from '../helpers/diffAffectedChats'
import type { MediaTuple } from '../helpers/resolveFrigateMedia'

export const endEventAction = async (
  event: SpotterEvent,
  mediaTuple: MediaTuple,
  context: TransportContext,
): Promise<void> => {
  const { bot, logger, prisma } = context
  const { id, ...eventData } = event

  let storedEvent = await prisma.event.findUnique({
    where: {
      id,
    },
  })

  if (storedEvent && storedEvent.type === 'end') {
    return
  }

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

  logger.debug('Feeding end event')

  const contents = renderEvent(storedEvent, context, mediaTuple)

  const actualChats = await prisma.chat.findMany({
    select: {
      id: true,
    },
  })

  const { added, intersected } = diffAffectedChats(
    actualChats,
    storedEvent.messages,
  )

  const options = { parse_mode: 'HTML' as const }

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

  logger.debug('Feeding end event successfully finished')
}
