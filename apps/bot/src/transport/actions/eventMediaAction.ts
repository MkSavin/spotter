import type { InputMediaPhoto, InputMediaVideo } from 'grammy/out/types.node'
import type { TransportContext } from '../../context'
import { InnoxiousMedia } from '../../media/InnoxiousMedia'
import { supplySubscribers } from '../helpers/supplySubscribers'
import { renderEvent } from '../view/renderEvent'
import type { EventMessage } from '.prisma/client'

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

  const innoxeus = new InnoxiousMedia(media)

  logger.debug('Feeding event media')
  logger.verbose('Event media:', innoxeus)

  const contents = renderEvent(storedEvent, context)

  let tryIndex = 0

  const options = { parse_mode: 'HTML' as const }

  const sendMedia = async (message: EventMessage): Promise<void> => {
    const { chatId, id } = message

    if (tryIndex < 3) {
      try {
        await bot.api.sendMediaGroup(chatId, await innoxeus.naive(), {
          reply_to_message_id: id,
          disable_notification: true,
        })
        logger.verbose(`Media sent to ${chatId} replying to ${id}`)
        tryIndex = 0
      } catch (error) {
        logger.error('Error while publishing media by public strategy', error)
        tryIndex++
      }
    }

    if (tryIndex !== 0) {
      logger.debug('Retrying with buffered strategy')

      try {
        await bot.api.sendMediaGroup(chatId, await innoxeus.accurate(), {
          reply_to_message_id: id,
          disable_notification: true,
        })
        logger.verbose(`Media sent to ${chatId} replying to ${id}`)
      } catch (error) {
        logger.error('Error while publishing media by buffered strategy', error)
      }
    }
  }

  await supplySubscribers(storedEvent.messages, context, {
    create: async (chatId) => {
      const message = await bot.api.sendMessage(chatId, contents, options)

      await sendMedia({
        id: message.message_id,
        chatId,
      })
    },
    update: async (message) => {
      await sendMedia(message)
    },
  })
}
