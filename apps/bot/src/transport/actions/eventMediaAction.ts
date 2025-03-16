import { InputFile } from 'grammy'
import type { InputMediaPhoto, InputMediaVideo } from 'grammy/out/types.node'
import type { TransportContext } from '../../context'
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
  const { bot, logger, prisma, config } = context
  const { eventId, media } = payload

  const correctedMedia = await Promise.all(
    media.map(async (entry) => {
      if (typeof entry.media !== 'string') {
        return entry
      }

      if (
        !entry.media.includes('://localhost') &&
        config.media.strategy === 'link'
      ) {
        return entry
      }

      const response = await fetch(entry.media as string, {
        method: 'GET',
      })

      if (!response.ok) {
        return entry
      }

      return {
        ...entry,
        media: new InputFile(new Uint8Array(await response.arrayBuffer())),
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

  logger.debug('Feeding event media successfully finished')
}
