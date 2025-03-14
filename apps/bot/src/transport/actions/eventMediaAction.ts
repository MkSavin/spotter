import type { TransportContext } from '../../context'
import { diffAffectedChats } from '../helpers/diffAffectedChats'
import type { InputMediaPhoto, InputMediaVideo } from 'grammy/out/types.node'
import { renderEvent } from '../view/renderEvent'

type EventMediaPayload = {
  eventId: string
  media: (InputMediaPhoto | InputMediaVideo)[]
}

export const eventMediaAction = async (
  payload: EventMediaPayload,
  context: TransportContext,
): Promise<void> => {
  const { bot, logger, prisma } = context
  const { eventId, media } = payload

  const storedEvent = await prisma.event.findUnique({
    where: {
      id: eventId,
    },
  })

  if (!storedEvent) {
    return
  }

  logger.debug('Feeding event media')

  const actualChats = await prisma.chat.findMany({
    select: {
      id: true,
    },
  })

  const { added, intersected } = diffAffectedChats(
    actualChats,
    storedEvent.messages,
  )

  const contents = renderEvent(storedEvent, context)

  await Promise.all([
    ...added.map((chat) => {
      const [firstMedia, secondMedia] = media

      return bot.api.sendMediaGroup(
        chat.id,
        [
          { ...firstMedia, parse_mode: 'HTML' as const, caption: contents },
          secondMedia,
        ].filter(Boolean),
      )
    }),
    ...intersected.map((message) =>
      bot.api.sendMediaGroup(message.chatId, media, {
        reply_to_message_id: message.id,
      }),
    ),
  ])

  logger.debug('Feeding event media successfully finished')
}
