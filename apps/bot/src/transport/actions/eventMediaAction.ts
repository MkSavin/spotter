import type { InputMediaPhoto, InputMediaVideo } from 'grammy/out/types.node'
import type { TransportContext } from '../../context'
import { correctMediaSource } from '../helpers/correctMediaSource'
import { diffAffectedChats } from '../helpers/diffAffectedChats'
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

  const correctedMedia = await Promise.all(
    media.map(async (entry) => {
      const corrected = await correctMediaSource(entry.media, context)

      if (!corrected) {
        return entry
      }

      return {
        ...entry,
        media: corrected,
      }
    }),
  )

  const storedEvent = await prisma.event.findUnique({
    where: {
      id: eventId,
    },
  })

  if (!storedEvent) {
    return
  }

  logger.debug('Feeding event media')
  logger.verbose('Event media:', correctedMedia)

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
      const [firstMedia, secondMedia] = correctedMedia

      return bot.api.sendMediaGroup(
        chat.id,
        [
          { ...firstMedia, parse_mode: 'HTML' as const, caption: contents },
          secondMedia,
        ].filter(Boolean),
      )
    }),
    ...intersected.map((message) =>
      bot.api.sendMediaGroup(message.chatId, correctedMedia, {
        reply_to_message_id: message.id,
      }),
    ),
  ])
    .then(() => {
      logger.debug('Feeding event media successfully finished')
    })
    .catch((error: any) => {
      logger.error(
        'Error when processing messages while feeding event media',
        error,
      )
    })
}
