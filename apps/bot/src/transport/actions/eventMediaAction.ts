import type { InputMediaPhoto, InputMediaVideo } from 'grammy/types'
import type { TransportContext } from '../../context'
import { InnoxiousMediaGroup } from '../../extension/innoxious/InnoxiousMedia'
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

  const innoxeus = new InnoxiousMediaGroup(media)

  logger.debug('Feeding event media')
  logger.verbose('Event media:', innoxeus)

  const contents = renderEvent(storedEvent, context)

  const options = { parse_mode: 'HTML' as const }

  const sendMedia = async (message: EventMessage): Promise<void> => {
    const { chatId, id } = message

    // TODO: test bot.api.copyMessage

    await bot.api.innoxious.sendMediaGroup(chatId, innoxeus, {
      reply_to_message_id: id,
      disable_notification: true,
    })
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
